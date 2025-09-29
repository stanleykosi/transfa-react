/**
 * @description
 * This file contains the core application logic for the customer-service.
 * It defines the event handler that processes messages from the RabbitMQ queue.
 *
 * @dependencies
 * - encoding/json: For unmarshaling message payloads.
 * - log: For logging application events and errors.
 * - github.com/transfa/customer-service/internal/domain: For domain model definitions.
 * - github.com/transfa/customer-service/internal/store: For the user repository interface.
 * - github.com/transfa/customer-service/pkg/anchorclient: For the Anchor API client.
 *
 * @notes
 * - The handler contains the primary business logic: creating a customer on the BaaS
 *   platform and updating the internal user record.
 * - Robust error handling is crucial here. If any step fails (e.g., Anchor API call,
 *   database update), the message should ideally be re-queued or sent to a dead-letter
 *   queue for manual inspection to prevent data inconsistencies.
 */
package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/transfa/customer-service/internal/domain"
	"github.com/transfa/customer-service/internal/store"
	"github.com/transfa/customer-service/pkg/anchorclient"
)

// UserEventHandler handles processing of user-related events.
type UserEventHandler struct {
	repo         store.UserRepository
	anchorClient *anchorclient.Client
}

// NewUserEventHandler creates a new instance of UserEventHandler.
func NewUserEventHandler(repo store.UserRepository, anchorClient *anchorclient.Client) *UserEventHandler {
	return &UserEventHandler{
		repo:         repo,
		anchorClient: anchorClient,
	}
}

// HandleUserCreatedEvent is the callback function that processes a `user.created` event.
// It returns a boolean indicating whether the message was successfully processed and should be acknowledged.
func (h *UserEventHandler) HandleUserCreatedEvent(body []byte) bool {
	var event domain.UserCreatedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling user.created event: %v", err)
		return true // Acknowledge message, as it's malformed and cannot be retried.
	}

	log.Printf("Processing user.created event for UserID: %s", event.UserID)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	userType, ok := event.KYCData["userType"].(string)
	if !ok {
		log.Printf("ERROR: 'userType' missing or not a string in KYCData for UserID: %s", event.UserID)
		return true // Acknowledge, can't be processed.
	}

	var anchorCustomerID string
	var err error

	// If this user already has an Anchor Customer ID, skip creating again (idempotent)
	if anchorIDPtr, getErr := h.repo.GetAnchorCustomerIDByUserID(ctx, event.UserID); getErr == nil && anchorIDPtr != nil && *anchorIDPtr != "" {
		log.Printf("Anchor customer already linked (%s) for UserID %s. Skipping creation.", *anchorIDPtr, event.UserID)
		return true
	}

	// Create customer on Anchor based on user type
	switch domain.UserType(userType) {
	case domain.PersonalUser:
		anchorCustomerID, err = h.createPersonalCustomerWithIdempotency(ctx, event)
	case domain.MerchantUser:
		log.Printf("Merchant user onboarding is not yet implemented. UserID: %s", event.UserID)
		return true
	default:
		log.Printf("ERROR: Unknown user type '%s' for UserID: %s", userType, event.UserID)
		return true
	}

	if err != nil {
		// On known validation errors, acknowledge to prevent infinite requeue
		if strings.Contains(err.Error(), "missing required fields") {
			log.Printf("ACK after validation failure for UserID %s: %v", event.UserID, err)
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "failed", ptr(err.Error()))
			return true
		}

		// Handle "customer already exists" errors - this means customer was created but DB update failed
		if strings.Contains(err.Error(), "CUSTOMER_ALREADY_EXISTS") {
			log.Printf("Customer already exists on Anchor for UserID %s. This indicates a previous creation succeeded but DB update failed.", event.UserID)

			// Check if we can extract the customer ID from the error for automatic recovery
			if strings.Contains(err.Error(), "CUSTOMER_ALREADY_EXISTS_WITH_ID") {
				// Extract customer ID from error message
				parts := strings.Split(err.Error(), "|")
				if len(parts) >= 2 {
					customerID := strings.TrimPrefix(parts[0], "CUSTOMER_ALREADY_EXISTS_WITH_ID: ")
					log.Printf("Attempting automatic recovery for UserID %s with extracted customer ID: %s", event.UserID, customerID)

					// Extract and construct full name from structured KYC data for database update
					firstName, _ := event.KYCData["firstName"].(string)
					lastName, _ := event.KYCData["lastName"].(string)
					middleName, _ := event.KYCData["middleName"].(string)
					maidenName, _ := event.KYCData["maidenName"].(string)

					var fullNamePtr *string
					if firstName != "" && lastName != "" {
						fullNameParts := []string{firstName}
						if middleName != "" {
							fullNameParts = append(fullNameParts, middleName)
						}
						fullNameParts = append(fullNameParts, lastName)
						if maidenName != "" {
							fullNameParts = append(fullNameParts, "("+maidenName+")")
						}
						constructedFullName := strings.Join(fullNameParts, " ")
						fullNamePtr = &constructedFullName
					}

					// Update the database with the existing customer ID and full name
					if updateErr := h.repo.UpdateAnchorCustomerInfo(ctx, event.UserID, customerID, fullNamePtr); updateErr != nil {
						log.Printf("ERROR: Failed to update user record with existing Anchor customer ID %s for UserID %s: %v", customerID, event.UserID, updateErr)
						_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "system_error", ptr("Customer exists on Anchor but failed to link in database. Manual intervention required."))
						return true // ACK to prevent infinite requeue
					}

					log.Printf("Successfully recovered and linked existing Anchor customer %s to UserID %s", customerID, event.UserID)
					_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "created", nil)
					return true // ACK - recovery successful
				}
			}

			// If we can't extract customer ID, mark as system error requiring manual intervention
			log.Printf("CRITICAL: Customer exists on Anchor but not in our DB for UserID %s. Manual intervention required to link the customer.", event.UserID)
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "system_error", ptr("Customer exists on Anchor but not linked in database. Manual intervention required."))
			return true // ACK to prevent infinite requeue
		}

		// Non-retriable client errors from Anchor (4xx): ACK to stop requeue storm
		if strings.Contains(err.Error(), "status 400") ||
			strings.Contains(err.Error(), "status 401") ||
			strings.Contains(err.Error(), "status 403") ||
			strings.Contains(err.Error(), "status 404") ||
			strings.Contains(err.Error(), "status 409") ||
			strings.Contains(err.Error(), "status 422") {
			log.Printf("Non-retriable client error from Anchor (ACK). UserID %s: %v", event.UserID, err)
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "failed", ptr(err.Error()))
			return true
		}
		// Rate limit from Anchor: ACK to avoid hot-looping and API limits
		if strings.Contains(err.Error(), "status 429") || strings.Contains(strings.ToLower(err.Error()), "too many requests") {
			log.Printf("Rate limited by Anchor (ACK). UserID %s: %v", event.UserID, err)
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "rate_limited", ptr("Rate limited by Anchor API. Please try again later."))
			return true
		}

		// For any other errors (5xx, network issues, etc.), ACK to prevent API rate limiting
		// This prevents hitting Anchor's API limits with repeated failed requests
		log.Printf("ERROR: Failed to create Anchor customer for UserID %s (ACK to prevent API limits): %v", event.UserID, err)
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "failed", ptr("Failed to create customer on Anchor. Please try again later."))
		return true // ACK to prevent API rate limiting
	}

	log.Printf("Successfully created Anchor customer %s for UserID %s", anchorCustomerID, event.UserID)

	// Update our internal user record with the new Anchor Customer ID
	if err := h.repo.UpdateAnchorCustomerID(ctx, event.UserID, anchorCustomerID); err != nil {
		log.Printf("ERROR: Failed to update user record for UserID %s with AnchorID %s: %v", event.UserID, anchorCustomerID, err)
		return false
	}
	log.Printf("Successfully updated user record for UserID %s", event.UserID)

	// Record success status for Tier 0 so frontend can surface it
	_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier0", "created", nil)

	// Tier 1 is handled later in the account creation flow
	return true
}

func (h *UserEventHandler) HandleTier1VerificationRequestedEvent(body []byte) bool {
	var event domain.Tier1VerificationRequestedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling tier1.verification.requested event: %v", err)
		return true
	}

	if event.UserID == "" || event.AnchorCustomerID == "" {
		log.Printf("Invalid tier1.verification.requested event: missing user or anchor customer ID")
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "processing", nil); err != nil {
		log.Printf("Failed to mark tier1 processing for user %s: %v", event.UserID, err)
	}

	req := domain.AnchorIndividualKYCRequest{
		Data: domain.RequestData{
			Type: "Verification",
			Attributes: domain.IndividualKYCAttributes{
				Level: "TIER_1",
				Level1: domain.KYCLevel1{
					BVN:         event.BVN,
					DateOfBirth: event.DateOfBirth,
					Gender:      strings.Title(strings.ToLower(event.Gender)),
				},
			},
		},
	}

	if err := h.anchorClient.TriggerIndividualKYC(ctx, event.AnchorCustomerID, req); err != nil {
		log.Printf("ERROR: Failed to trigger Anchor Tier1 KYC for user %s: %v", event.UserID, err)
		reason := fmt.Sprintf("Failed to trigger Anchor Tier1 KYC: %v", err)
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return false
	}

	log.Printf("Successfully triggered Anchor Tier1 KYC for user %s", event.UserID)
	return true
}

// createPersonalCustomer handles the logic for creating an IndividualCustomer on Anchor.
func (h *UserEventHandler) createPersonalCustomer(ctx context.Context, event domain.UserCreatedEvent) (string, error) {
	fullName, _ := event.KYCData["fullName"].(string)
	email, _ := event.KYCData["email"].(string)
	phoneNumber, _ := event.KYCData["phoneNumber"].(string)

	if fullName == "" || email == "" || phoneNumber == "" {
		return "", fmt.Errorf("missing required fields (fullName, email, phoneNumber) in KYCData")
	}

	// Split full name into first and last name as Anchor expects at least firstName and lastName
	firstName := fullName
	lastName := ""
	parts := strings.Fields(fullName)
	if len(parts) >= 2 {
		firstName = strings.Join(parts[:len(parts)-1], " ")
		lastName = parts[len(parts)-1]
	}

	req := domain.AnchorCreateIndividualCustomerRequest{
		Data: domain.RequestData{
			Type: "IndividualCustomer",
			Attributes: domain.IndividualCustomerAttributes{
				FullName:    domain.FullName{FirstName: firstName, LastName: lastName},
				Email:       email,
				PhoneNumber: phoneNumber,
				Address: domain.Address{
					AddressLine1: getString(event.KYCData, "addressLine1", "123 Main Street"),
					City:         getString(event.KYCData, "city", "Ikeja"),
					State:        getString(event.KYCData, "state", "Lagos"),
					PostalCode:   getString(event.KYCData, "postalCode", "100001"),
					Country:      getString(event.KYCData, "country", "NG"),
				},
			},
		},
	}

	resp, err := h.anchorClient.CreateIndividualCustomer(ctx, req)
	if err != nil {
		return "", err
	}
	return resp.Data.ID, nil
}

// createPersonalCustomerWithIdempotency handles the logic for creating an IndividualCustomer on Anchor with proper idempotency.
func (h *UserEventHandler) createPersonalCustomerWithIdempotency(ctx context.Context, event domain.UserCreatedEvent) (string, error) {
	// Extract structured name fields
	firstName, _ := event.KYCData["firstName"].(string)
	lastName, _ := event.KYCData["lastName"].(string)
	middleName, _ := event.KYCData["middleName"].(string)
	maidenName, _ := event.KYCData["maidenName"].(string)
	email, _ := event.KYCData["email"].(string)
	phoneNumber, _ := event.KYCData["phoneNumber"].(string)

	if firstName == "" || lastName == "" || email == "" || phoneNumber == "" {
		return "", fmt.Errorf("missing required fields (firstName, lastName, email, phoneNumber) in KYCData")
	}

	req := domain.AnchorCreateIndividualCustomerRequest{
		Data: domain.RequestData{
			Type: "IndividualCustomer",
			Attributes: domain.IndividualCustomerAttributes{
				FullName: domain.FullName{
					FirstName:  firstName,
					LastName:   lastName,
					MiddleName: middleName,
					MaidenName: maidenName,
				},
				Email:       email,
				PhoneNumber: phoneNumber,
				Address: domain.Address{
					AddressLine1: getString(event.KYCData, "addressLine1", "123 Main Street"),
					City:         getString(event.KYCData, "city", "Ikeja"),
					State:        getString(event.KYCData, "state", "Lagos"),
					PostalCode:   getString(event.KYCData, "postalCode", "100001"),
					Country:      getString(event.KYCData, "country", "NG"),
				},
			},
		},
	}

	resp, err := h.anchorClient.CreateIndividualCustomerWithIdempotency(ctx, req)
	if err != nil {
		return "", err
	}
	return resp.Data.ID, nil
}

func getString(m map[string]interface{}, key, def string) string {
	if v, ok := m[key].(string); ok && v != "" {
		return v
	}
	return def
}

func ptr(s string) *string { return &s }
