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
		anchorCustomerID, err = h.createPersonalCustomer(ctx, event)
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
			return true
		}
		// Non-retriable client errors from Anchor (4xx): ACK to stop requeue storm
		if strings.Contains(err.Error(), "status 400") ||
			strings.Contains(err.Error(), "status 401") ||
			strings.Contains(err.Error(), "status 403") ||
			strings.Contains(err.Error(), "status 404") ||
			strings.Contains(err.Error(), "status 409") ||
			strings.Contains(err.Error(), "status 422") ||
			strings.Contains(strings.ToLower(err.Error()), "already exist") {
			log.Printf("Non-retriable client error from Anchor (ACK). UserID %s: %v", event.UserID, err)
			return true
		}
		// Rate limit from Anchor: ACK to avoid hot-looping, rely on scheduled/backoff retry later
		if strings.Contains(err.Error(), "status 429") || strings.Contains(strings.ToLower(err.Error()), "too many requests") {
			log.Printf("Rate limited by Anchor (ACK). UserID %s: %v", event.UserID, err)
			return true
		}
		log.Printf("ERROR: Failed to create Anchor customer for UserID %s: %v", event.UserID, err)
		return false // transient error → retry
	}

	log.Printf("Successfully created Anchor customer %s for UserID %s", anchorCustomerID, event.UserID)

	// Update our internal user record with the new Anchor Customer ID
	if err := h.repo.UpdateAnchorCustomerID(ctx, event.UserID, anchorCustomerID); err != nil {
		log.Printf("ERROR: Failed to update user record for UserID %s with AnchorID %s: %v", event.UserID, anchorCustomerID, err)
		return false
	}
	log.Printf("Successfully updated user record for UserID %s", event.UserID)

	// Tier 1 is handled later in the account creation flow
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
				FullName: domain.FullName{ FirstName: firstName, LastName: lastName },
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

func getString(m map[string]interface{}, key, def string) string {
	if v, ok := m[key].(string); ok && v != "" {
		return v
	}
	return def
}
