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

// HandleCustomerVerifiedEvent processes a `customer.verified` event.
// It returns true if the message should be acknowledged, false if it should be re-queued.
func (h *AccountEventHandler) HandleCustomerVerifiedEvent(body []byte) bool {
	var event domain.CustomerVerifiedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling customer.verified event: %v", err)
		return true // Acknowledge malformed message.
	}

	log.Printf("Processing customer.verified event for AnchorCustomerID: %s", event.AnchorCustomerID)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// 1. Find our internal user ID from the Anchor Customer ID.
	userID, err := h.repo.FindUserIDByAnchorCustomerID(ctx, event.AnchorCustomerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			log.Printf("CRITICAL: Received customer.verified event for an unknown AnchorCustomerID: %s. Acknowledging to avoid requeue loop.", event.AnchorCustomerID)
			return true
		}
		log.Printf("ERROR: Failed to find user by AnchorID %s: %v", event.AnchorCustomerID, err)
		return false // Retryable database error.
	}

	// 2. Create a Deposit Account on Anchor for this customer.
	// For now, we assume all are 'personal' users getting a 'SAVINGS' account.
	// A more robust implementation would fetch user type from the DB.
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
		return false // Retryable API error.
	}
	log.Printf("Successfully created Anchor DepositAccount %s", anchorAccount.Data.ID)

	// 3. Get the Virtual NUBAN associated with the new deposit account.
	nuban, err := h.anchorClient.GetVirtualNUBANForAccount(ctx, anchorAccount.Data.ID)
	if err != nil {
		log.Printf("ERROR: Failed to fetch VirtualNUBAN for AnchorAccountID %s: %v", anchorAccount.Data.ID, err)
		return false // Retryable API error.
	}
	log.Printf("Successfully fetched VirtualNUBAN: %s", nuban)

	// 4. Save the new account details to our database.
	newAccount := &domain.Account{
		UserID:          userID,
		AnchorAccountID: anchorAccount.Data.ID,
		VirtualNUBAN:    nuban,
		Type:            domain.PrimaryAccount,
	}
	_, err = h.repo.CreateAccount(ctx, newAccount)
	if err != nil {
		log.Printf("ERROR: Failed to save new account to DB for UserID %s: %v", userID, err)
		// This is a critical state. The account exists on Anchor but not in our DB.
		// A retry is necessary. If it persists, it will require manual intervention.
		return false
	}

	log.Printf("Successfully provisioned and saved account for UserID %s", userID)

	// TODO: In a later step, publish an `account.created` event for the notification-service
	// to send a "Welcome!" push notification to the user.

	return true // Acknowledge the message.
}
