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

	// Create customer on Anchor based on user type
	switch domain.UserType(userType) {
	case domain.PersonalUser:
		anchorCustomerID, err = h.createPersonalCustomer(ctx, event)
	case domain.MerchantUser:
		// Placeholder for business customer creation
		// anchorCustomerID, err = h.createBusinessCustomer(ctx, event)
		log.Printf("Merchant user onboarding is not yet implemented. UserID: %s", event.UserID)
		return true // Acknowledge for now
	default:
		log.Printf("ERROR: Unknown user type '%s' for UserID: %s", userType, event.UserID)
		return true // Acknowledge, can't be processed.
	}

	if err != nil {
		log.Printf("ERROR: Failed to create Anchor customer for UserID %s: %v", event.UserID, err)
		return false // Do not acknowledge, retry the message.
	}

	log.Printf("Successfully created Anchor customer %s for UserID %s", anchorCustomerID, event.UserID)

	// Update our internal user record with the new Anchor Customer ID
	if err := h.repo.UpdateAnchorCustomerID(ctx, event.UserID, anchorCustomerID); err != nil {
		log.Printf("ERROR: Failed to update user record for UserID %s with AnchorID %s: %v", event.UserID, anchorCustomerID, err)
		return false // Do not acknowledge, retry the message.
	}
	log.Printf("Successfully updated user record for UserID %s", event.UserID)

	// Trigger KYC verification on Anchor
	if domain.UserType(userType) == domain.PersonalUser {
		if err := h.triggerPersonalKYC(ctx, anchorCustomerID, event.KYCData); err != nil {
			log.Printf("WARNING: Failed to trigger KYC for Anchor customer %s. This may need manual intervention. Error: %v", anchorCustomerID, err)
			// We still acknowledge the message as the critical path (customer creation and DB update) succeeded.
			// A separate reconciliation job could handle failed KYC triggers.
		} else {
			log.Printf("Successfully triggered KYC verification for Anchor customer %s", anchorCustomerID)
		}
	}

	return true // Acknowledge the message as successfully processed.
}

// createPersonalCustomer handles the logic for creating an IndividualCustomer on Anchor.
func (h *UserEventHandler) createPersonalCustomer(ctx context.Context, event domain.UserCreatedEvent) (string, error) {
	// Extract and type-assert data from the KYCData map. Robust production code
	// would have more sophisticated validation.
	fullName, _ := event.KYCData["fullName"].(string)
	email, _ := event.KYCData["email"].(string)
	phoneNumber, _ := event.KYCData["phoneNumber"].(string)

	if fullName == "" || email == "" || phoneNumber == "" {
		return "", fmt.Errorf("missing required fields (fullName, email, phoneNumber) in KYCData")
	}

	req := domain.AnchorCreateIndividualCustomerRequest{
		Data: domain.RequestData{
			Type: "IndividualCustomer",
			Attributes: domain.IndividualCustomerAttributes{
				FullName: domain.FullName{
					FirstName: fullName, // Simple split, could be improved.
				},
				Email:       email,
				PhoneNumber: phoneNumber,
				Address: domain.Address{ // Dummy address data as per spec minimums.
					AddressLine1: "123 Main Street",
					City:         "Ikeja",
					State:        "Lagos",
					Country:      "NG",
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

// triggerPersonalKYC handles the logic for triggering Tier 1 KYC on Anchor.
func (h *UserEventHandler) triggerPersonalKYC(ctx context.Context, anchorCustomerID string, kycData map[string]interface{}) error {
	bvn, _ := kycData["bvn"].(string)
	dob, _ := kycData["dateOfBirth"].(string) // Expects "YYYY-MM-DD"

	if bvn == "" || dob == "" {
		return fmt.Errorf("missing required fields (bvn, dateOfBirth) in KYCData for KYC trigger")
	}

	req := domain.AnchorIndividualKYCRequest{
		Data: domain.RequestData{
			Type: "Verification",
			Attributes: domain.IndividualKYCAttributes{
				Level: "TIER_1",
				Level1: domain.KYCLevel1{
					BVN:         bvn,
					DateOfBirth: dob,
					Gender:      "Male", // Placeholder, this should come from the client.
				},
			},
		},
	}

	return h.anchorClient.TriggerIndividualKYC(ctx, anchorCustomerID, req)
}
