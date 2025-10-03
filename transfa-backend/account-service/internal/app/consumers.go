/**
 * @description
 * This file contains the core application logic for the account-service. It defines
 * the event handler that processes messages from RabbitMQ to provision accounts.
 *
 * @dependencies
 * - context, encoding/json, log: Standard Go libraries.
 * - The service's internal packages for domain models, storage, and external clients.
 */
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/transfa/account-service/internal/domain"
	"github.com/transfa/account-service/internal/store"
	"github.com/transfa/account-service/pkg/anchorclient"
)

// AccountEventHandler handles the processing of account-related events.
type AccountEventHandler struct {
	repo         store.AccountRepository
	anchorClient *anchorclient.Client
}

// NewAccountEventHandler creates a new instance of AccountEventHandler.
func NewAccountEventHandler(repo store.AccountRepository, anchorClient *anchorclient.Client) *AccountEventHandler {
	return &AccountEventHandler{
		repo:         repo,
		anchorClient: anchorClient,
	}
}

// HandleCustomerVerifiedEvent processes Tier2 approval events.
func (h *AccountEventHandler) HandleCustomerVerifiedEvent(body []byte) bool {
	var event domain.CustomerVerifiedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling customer.verified event: %v", err)
		return true // Acknowledge malformed message.
	}

	if event.AnchorCustomerID == "" {
		log.Printf("customer.verified event missing AnchorCustomerID; acking")
		return true
	}

	log.Printf("Processing customer.verified event for AnchorCustomerID: %s", event.AnchorCustomerID)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	userID, err := h.repo.FindUserIDByAnchorCustomerID(ctx, event.AnchorCustomerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			log.Printf("CRITICAL: Received customer.verified event for an unknown AnchorCustomerID: %s. Acknowledging to avoid requeue loop.", event.AnchorCustomerID)
			return true
		}
		log.Printf("ERROR: Failed to find user by AnchorID %s: %v", event.AnchorCustomerID, err)
		return false // Retryable database error.
	}

	// Check if user already has an account to prevent duplicate creation
	existingAccount, err := h.repo.FindAccountByUserID(ctx, userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("ERROR: Failed to check for existing account for user %s: %v", userID, err)
		return false // Retryable database error
	}
	if existingAccount != nil {
		log.Printf("INFO: User %s already has an account (ID: %s). Skipping account creation.", userID, existingAccount.ID)
		return true // Acknowledge - no need to create duplicate account
	}

	approvedReason := ptr("Tier2 approved")
	if err := h.repo.UpdateTierStatus(ctx, userID, "tier2", "approved", approvedReason); err != nil {
		log.Printf("WARN: Failed to persist tier2 approved status for user %s: %v", userID, err)
	}

	accountReq := domain.CreateDepositAccountRequest{
		Data: domain.RequestData{
			Type: "DepositAccount",
			Attributes: domain.DepositAccountAttributes{
				ProductName: "SAVINGS",
			},
			Relationships: map[string]interface{}{
				"customer": domain.CustomerRelationshipData{
					Data: struct {
						ID   string `json:"id"`
						Type string `json:"type"`
					}{
						ID:   event.AnchorCustomerID,
						Type: "IndividualCustomer",
					},
				},
			},
		},
	}
	anchorAccount, err := h.anchorClient.CreateDepositAccount(ctx, accountReq)
	if err != nil {
		log.Printf("ERROR: Failed to create Anchor DepositAccount for AnchorCustomerID %s: %v", event.AnchorCustomerID, err)
		reason := fmt.Sprintf("Failed to create Anchor deposit account: %v", err)
		_ = h.repo.UpdateTierStatus(ctx, userID, "tier2", "failed", ptr(reason))
		return true // Ack to avoid duplicate provisioning attempts.
	}
	log.Printf("Successfully created Anchor DepositAccount %s", anchorAccount.Data.ID)

	nubanInfo, err := h.anchorClient.GetVirtualNUBANForAccount(ctx, anchorAccount.Data.ID)
	if err != nil {
		log.Printf("ERROR: Failed to fetch VirtualNUBAN for AnchorAccountID %s: %v", anchorAccount.Data.ID, err)
		reason := fmt.Sprintf("Failed to fetch virtual account number: %v", err)
		_ = h.repo.UpdateTierStatus(ctx, userID, "tier2", "failed", ptr(reason))
		return true // Ack to prevent hot-looping; manual retry can be triggered later.
	}
	log.Printf("Successfully fetched VirtualNUBAN: %s, Bank: %s", nubanInfo.AccountNumber, nubanInfo.BankName)

	// Get bank name from the original account creation response if not available from NUBAN fetch
	bankName := nubanInfo.BankName
	if bankName == "" {
		// Type assert Attributes to map[string]interface{} before accessing
		if attributesMap, ok := anchorAccount.Data.Attributes.(map[string]interface{}); ok {
			if bankData, exists := attributesMap["bank"]; exists {
				if bankMap, ok := bankData.(map[string]interface{}); ok {
					if name, exists := bankMap["name"]; exists {
						if nameStr, ok := name.(string); ok {
							bankName = nameStr
						}
					}
				}
			}
		}
	}

	newAccount := &domain.Account{
		UserID:          userID,
		AnchorAccountID: anchorAccount.Data.ID,
		VirtualNUBAN:    nubanInfo.AccountNumber,
		BankName:        bankName,
		Type:            domain.PrimaryAccount,
	}
	if _, err = h.repo.CreateAccount(ctx, newAccount); err != nil {
		log.Printf("ERROR: Failed to save new account to DB for UserID %s: %v", userID, err)
		reason := fmt.Sprintf("Failed to persist account record: %v", err)
		_ = h.repo.UpdateTierStatus(ctx, userID, "tier2", "failed", ptr(reason))
		return false // Requeue for transient database errors.
	}

	if err := h.repo.UpdateTierStatus(ctx, userID, "tier2", "completed", nil); err != nil {
		log.Printf("WARN: Failed to persist tier2 completed status for user %s: %v", userID, err)
	}

	log.Printf("Successfully provisioned and saved account for UserID %s", userID)

	return true
}

func ptr(v string) *string {
	return &v
}
