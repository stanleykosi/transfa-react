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
	publisher    EventPublisher
}

type EventPublisher interface {
	Publish(ctx context.Context, exchange, routingKey string, payload interface{}) error
}

// TierStatusEvent represents tier status updates received from other services.
type TierStatusEvent struct {
	UserID           string  `json:"user_id"`
	AnchorCustomerID string  `json:"anchor_customer_id"`
	Stage            string  `json:"stage"`
	Status           string  `json:"status"`
	Reason           *string `json:"reason"`
}

// NewUserEventHandler creates a new instance of UserEventHandler.
func NewUserEventHandler(repo store.UserRepository, anchorClient *anchorclient.Client, publisher EventPublisher) *UserEventHandler {
	return &UserEventHandler{
		repo:         repo,
		anchorClient: anchorClient,
		publisher:    publisher,
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
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", ptr(err.Error()))
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
						_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "system_error", ptr("Customer exists on Anchor but failed to link in database. Manual intervention required."))
						return true // ACK to prevent infinite requeue
					}

					log.Printf("Successfully recovered and linked existing Anchor customer %s to UserID %s", customerID, event.UserID)
					_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "created", nil)
					return true // ACK - recovery successful
				}
			}

			// If we can't extract customer ID, mark as system error requiring manual intervention
			log.Printf("CRITICAL: Customer exists on Anchor but not in our DB for UserID %s. Manual intervention required to link the customer.", event.UserID)
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "system_error", ptr("Customer exists on Anchor but not linked in database. Manual intervention required."))
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
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", ptr(err.Error()))
			return true
		}
		// Rate limit from Anchor: ACK to avoid hot-looping and API limits
		if strings.Contains(err.Error(), "status 429") || strings.Contains(strings.ToLower(err.Error()), "too many requests") {
			log.Printf("Rate limited by Anchor (ACK). UserID %s: %v", event.UserID, err)
			_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "rate_limited", ptr("Rate limited by Anchor API. Please try again later."))
			return true
		}

		// For any other errors (5xx, network issues, etc.), ACK to prevent API rate limiting
		// This prevents hitting Anchor's API limits with repeated failed requests
		log.Printf("ERROR: Failed to create Anchor customer for UserID %s (ACK to prevent API limits): %v", event.UserID, err)
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", ptr("Failed to create customer on Anchor. Please try again later."))
		return true // ACK to prevent API rate limiting
	}

	log.Printf("Successfully created Anchor customer %s for UserID %s", anchorCustomerID, event.UserID)

	// Update our internal user record with the new Anchor Customer ID
	if err := h.repo.UpdateAnchorCustomerID(ctx, event.UserID, anchorCustomerID); err != nil {
		log.Printf("ERROR: Failed to update user record for UserID %s with AnchorID %s: %v", event.UserID, anchorCustomerID, err)
		return false
	}
	log.Printf("Successfully updated user record for UserID %s", event.UserID)

	// Record success status for Tier 1 so frontend can surface it
	_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "created", nil)

	// Tier 2 is handled later in the account creation flow
	return true
}

// HandleTier1ProfileUpdateRequestedEvent updates an existing Anchor customer profile
// so users can fix mismatched KYC details before retrying Tier2.
func (h *UserEventHandler) HandleTier1ProfileUpdateRequestedEvent(body []byte) bool {
	var event domain.Tier1ProfileUpdateRequestedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling user.tier1.update.requested event: %v", err)
		return true
	}

	if strings.TrimSpace(event.UserID) == "" || strings.TrimSpace(event.AnchorCustomerID) == "" {
		log.Printf("Invalid user.tier1.update.requested event: missing user_id or anchor_customer_id")
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "processing", nil); err != nil {
		log.Printf("Failed to mark tier1 processing for user %s: %v", event.UserID, err)
	}

	firstName, err := requireKYCString(event.KYCData, "firstName")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	lastName, err := requireKYCString(event.KYCData, "lastName")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	email, err := requireKYCString(event.KYCData, "email")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	phoneNumber, err := requireKYCString(event.KYCData, "phoneNumber")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	addressLine1, err := requireKYCString(event.KYCData, "addressLine1")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	city, err := requireKYCString(event.KYCData, "city")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	state, err := requireKYCString(event.KYCData, "state")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	postalCode, err := requireKYCString(event.KYCData, "postalCode")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}
	country, err := requireKYCString(event.KYCData, "country")
	if err != nil {
		reason := err.Error()
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}

	middleName, _ := optionalKYCString(event.KYCData, "middleName")
	maidenName, _ := optionalKYCString(event.KYCData, "maidenName")
	addressLine2, _ := optionalKYCString(event.KYCData, "addressLine2")

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
					AddressLine1: addressLine1,
					AddressLine2: addressLine2,
					City:         city,
					State:        state,
					PostalCode:   postalCode,
					Country:      strings.ToUpper(country),
				},
			},
		},
	}

	if err := h.anchorClient.UpdateIndividualCustomer(ctx, event.AnchorCustomerID, req); err != nil {
		reason := fmt.Sprintf("Failed to update Anchor customer profile: %v", err)
		log.Printf("ERROR: %s (user_id=%s, anchor_customer_id=%s)", reason, event.UserID, event.AnchorCustomerID)
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "failed", &reason)
		return true
	}

	fullNameParts := []string{firstName}
	if middleName != "" {
		fullNameParts = append(fullNameParts, middleName)
	}
	fullNameParts = append(fullNameParts, lastName)
	if maidenName != "" {
		fullNameParts = append(fullNameParts, "("+maidenName+")")
	}
	updatedFullName := strings.Join(fullNameParts, " ")
	_ = h.repo.UpdateAnchorCustomerInfo(ctx, event.UserID, "", &updatedFullName)

	if err := h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier1", "created", nil); err != nil {
		log.Printf("Failed to mark tier1 created after update for user %s: %v", event.UserID, err)
	}

	log.Printf("Successfully updated Anchor customer profile for user %s", event.UserID)
	return true
}

func (h *UserEventHandler) HandleTier2VerificationRequestedEvent(body []byte) bool {
	var event domain.Tier2VerificationRequestedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling tier2.verification.requested event: %v", err)
		return true
	}

	if event.UserID == "" {
		var err error
		event.UserID, err = h.repo.FindUserIDByAnchorCustomerID(context.Background(), event.AnchorCustomerID)
		if err != nil || event.UserID == "" {
			log.Printf("Invalid tier2.verification.requested event: missing user or anchor customer ID")
			return true
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier2", "processing", nil); err != nil {
		log.Printf("Failed to mark tier2 processing for user %s: %v", event.UserID, err)
	}

	req := domain.AnchorIndividualKYCRequest{
		Data: domain.RequestData{
			Type: "Verification",
			Attributes: domain.IndividualKYCAttributes{
				Level: "TIER_2",
				Level2: &domain.KYCLevel2{
					BVN:         event.BVN,
					DateOfBirth: event.DateOfBirth,
					Gender:      event.Gender,
				},
			},
		},
	}

	if err := h.anchorClient.TriggerIndividualKYC(ctx, event.AnchorCustomerID, req); err != nil {
		lowerErr := strings.ToLower(err.Error())
		if strings.Contains(lowerErr, "status 412") && strings.Contains(lowerErr, "kyc already completed") {
			log.Printf("Tier2 KYC already completed on Anchor for user %s. Marking as completed.", event.UserID)
			if err := h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier2", "completed", nil); err != nil {
				log.Printf("Failed to mark tier2 completed for user %s: %v", event.UserID, err)
			}
			go h.triggerAccountRecovery(event)
			return true
		}

		log.Printf("ERROR: Failed to trigger Anchor Tier2 KYC for user %s: %v", event.UserID, err)
		reason := fmt.Sprintf("Failed to trigger Anchor Tier2 KYC: %v", err)
		_ = h.repo.UpsertOnboardingStatus(ctx, event.UserID, "tier2", "failed", &reason)
		return false
	}

	log.Printf("Successfully triggered Anchor Tier2 KYC for user %s", event.UserID)
	return true
}

func (h *UserEventHandler) triggerAccountRecovery(event domain.Tier2VerificationRequestedEvent) {
	if h.publisher == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userID := event.UserID
	if userID == "" {
		resolved, err := h.repo.FindUserIDByAnchorCustomerID(ctx, event.AnchorCustomerID)
		if err != nil || resolved == "" {
			log.Printf("Auto reconcile skipped: unable to resolve user for anchor ID %s: %v", event.AnchorCustomerID, err)
			return
		}
		userID = resolved
	}

	jobCtx, cancelJob := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelJob()

	hasAccount, err := h.repo.UserHasAccount(jobCtx, userID)
	if err != nil {
		log.Printf("Auto reconcile: failed to check existing account for user %s: %v", userID, err)
		return
	}
	if hasAccount {
		log.Printf("Auto reconcile: user %s already has an account. No recovery event published.", userID)
		return
	}

	payload := map[string]string{
		"anchor_customer_id": event.AnchorCustomerID,
		"user_id":            userID,
		"source":             "auto_reconcile",
	}

	if err := h.publisher.Publish(ctx, "customer_events", "customer.verified", payload); err != nil {
		log.Printf("Auto reconcile: failed to publish customer.verified for user %s: %v", userID, err)
		return
	}

	log.Printf("Auto reconcile: published customer.verified for user %s after 412 response", userID)
}

// HandleTierStatusEvent processes tier status updates (e.g., rejections, manual review) to keep onboarding state in sync.
func (h *UserEventHandler) HandleTierStatusEvent(body []byte) bool {
	var event TierStatusEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error unmarshaling customer.tier.status event: %v", err)
		return true
	}

	if event.UserID == "" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		userID, err := h.repo.FindUserIDByAnchorCustomerID(ctx, event.AnchorCustomerID)
		if err != nil || userID == "" {
			log.Printf("Unable to resolve user for tier status event (anchor_id=%s): %v", event.AnchorCustomerID, err)
			return true
		}
		event.UserID = userID
	}

	if event.Status == "" {
		log.Printf("customer.tier.status missing status field for user %s", event.UserID)
		return true
	}

	stage := normalizeTierStage(event.Stage, event.Status)
	normalizedStatus := normalizeTierStatus(event.Status)
	if normalizedStatus == "" {
		log.Printf("customer.tier.status invalid status for user %s: %q", event.UserID, event.Status)
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := h.repo.UpsertOnboardingStatus(ctx, event.UserID, stage, normalizedStatus, event.Reason); err != nil {
		log.Printf("Failed to persist tier status %s/%s for user %s: %v", stage, normalizedStatus, event.UserID, err)
		return false
	}

	log.Printf("Updated onboarding status for user %s -> %s/%s", event.UserID, stage, normalizedStatus)
	return true
}

func normalizeTierStage(stage, status string) string {
	normalizedStage := strings.ToLower(strings.TrimSpace(stage))
	switch normalizedStage {
	case "tier1", "tier2":
		return normalizedStage
	}

	normalizedStatus := strings.ToLower(strings.TrimSpace(status))
	if strings.HasPrefix(normalizedStatus, "tier1_") {
		return "tier1"
	}
	return "tier2"
}

func normalizeTierStatus(status string) string {
	normalized := strings.ToLower(strings.TrimSpace(status))
	normalized = strings.TrimPrefix(normalized, "tier1_")
	normalized = strings.TrimPrefix(normalized, "tier2_")
	switch normalized {
	case "created", "pending", "processing", "completed", "failed", "error", "manual_review", "rejected", "rate_limited", "system_error", "approved", "awaiting_document", "reenter_information":
		return normalized
	default:
		return ""
	}
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
	addressLine1, err := requireKYCString(event.KYCData, "addressLine1")
	if err != nil {
		return "", err
	}
	city, err := requireKYCString(event.KYCData, "city")
	if err != nil {
		return "", err
	}
	state, err := requireKYCString(event.KYCData, "state")
	if err != nil {
		return "", err
	}
	postalCode, err := requireKYCString(event.KYCData, "postalCode")
	if err != nil {
		return "", err
	}
	country, err := requireKYCString(event.KYCData, "country")
	if err != nil {
		return "", err
	}
	addressLine2, _ := optionalKYCString(event.KYCData, "addressLine2")

	req := domain.AnchorCreateIndividualCustomerRequest{
		Data: domain.RequestData{
			Type: "IndividualCustomer",
			Attributes: domain.IndividualCustomerAttributes{
				FullName:    domain.FullName{FirstName: firstName, LastName: lastName},
				Email:       email,
				PhoneNumber: phoneNumber,
				Address: domain.Address{
					AddressLine1: addressLine1,
					AddressLine2: addressLine2,
					City:         city,
					State:        state,
					PostalCode:   postalCode,
					Country:      strings.ToUpper(country),
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
	addressLine1, err := requireKYCString(event.KYCData, "addressLine1")
	if err != nil {
		return "", err
	}
	city, err := requireKYCString(event.KYCData, "city")
	if err != nil {
		return "", err
	}
	state, err := requireKYCString(event.KYCData, "state")
	if err != nil {
		return "", err
	}
	postalCode, err := requireKYCString(event.KYCData, "postalCode")
	if err != nil {
		return "", err
	}
	country, err := requireKYCString(event.KYCData, "country")
	if err != nil {
		return "", err
	}
	addressLine2, _ := optionalKYCString(event.KYCData, "addressLine2")

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
					AddressLine1: addressLine1,
					AddressLine2: addressLine2,
					City:         city,
					State:        state,
					PostalCode:   postalCode,
					Country:      strings.ToUpper(country),
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

func requireKYCString(values map[string]interface{}, key string) (string, error) {
	value, ok := values[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("missing required field (%s) in KYCData", key)
	}
	return strings.TrimSpace(value), nil
}

func optionalKYCString(values map[string]interface{}, key string) (string, bool) {
	value, ok := values[key].(string)
	if !ok {
		return "", false
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
}

func ptr(s string) *string { return &s }
