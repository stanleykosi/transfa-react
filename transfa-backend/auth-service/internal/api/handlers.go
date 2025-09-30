package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/transfa/auth-service/internal/domain"
	"github.com/transfa/auth-service/internal/store"
	"github.com/transfa/auth-service/pkg/rabbitmq"
)

// OnboardingHandler handles the user onboarding process.
type OnboardingHandler struct {
	repo     store.UserRepository
	producer *rabbitmq.EventProducer
}

// NewOnboardingHandler creates a new handler for the onboarding endpoint.
func NewOnboardingHandler(repo store.UserRepository, producer *rabbitmq.EventProducer) *OnboardingHandler {
	return &OnboardingHandler{repo: repo, producer: producer}
}

// HandleTier2 receives BVN/DOB/Gender and records onboarding_status (tier2 -> pending). Returns 202.
func (h *OnboardingHandler) HandleTier2(w http.ResponseWriter, r *http.Request) {
	clerkUserID := r.Header.Get("X-Clerk-User-Id")
	if clerkUserID == "" {
		http.Error(w, "Unauthorized: Clerk User ID missing", http.StatusUnauthorized)
		return
	}
	existing, err := h.repo.FindByClerkUserID(r.Context(), clerkUserID)
	if err != nil || existing == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

    if existing.AnchorCustomerID == nil || *existing.AnchorCustomerID == "" {
        http.Error(w, "Tier 1 verification incomplete", http.StatusPreconditionFailed)
		return
	}

	var body struct {
		Dob    string `json:"dob"`
		Gender string `json:"gender"`
		Bvn    string `json:"bvn"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	body.Dob = strings.TrimSpace(body.Dob)
	body.Gender = strings.TrimSpace(body.Gender)
	body.Bvn = strings.TrimSpace(body.Bvn)

	if body.Dob == "" || body.Gender == "" || body.Bvn == "" {
		http.Error(w, "BVN, date of birth and gender are required", http.StatusBadRequest)
		return
	}

	if len(body.Bvn) != 11 {
		http.Error(w, "BVN must be 11 digits", http.StatusBadRequest)
		return
	}
	for _, ch := range body.Bvn {
		if ch < '0' || ch > '9' {
			http.Error(w, "BVN must contain only digits", http.StatusBadRequest)
			return
		}
	}

	genderLower := strings.ToLower(body.Gender)
	switch genderLower {
	case "male", "female":
	default:
		http.Error(w, "Gender must be 'male' or 'female'", http.StatusBadRequest)
		return
	}

	normalizedGender := strings.ToUpper(genderLower[:1]) + genderLower[1:]

    if err := h.repo.UpsertOnboardingStatus(r.Context(), existing.ID, "tier2", "pending", nil); err != nil {
        log.Printf("Failed to persist tier2 pending status for user %s: %v", existing.ID, err)
		http.Error(w, "Failed to update status", http.StatusInternalServerError)
		return
	}

	if h.producer != nil {
		event := domain.Tier2VerificationRequestedEvent{
			UserID:           existing.ID,
			AnchorCustomerID: *existing.AnchorCustomerID,
			BVN:              body.Bvn,
			DateOfBirth:      body.Dob,
			Gender:           normalizedGender,
		}
		if err := h.producer.Publish(r.Context(), "customer_events", "tier1.verification.requested", event); err != nil {
			log.Printf("Failed to publish tier1.verification.requested event for user %s: %v", existing.ID, err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "tier1_pending"})
}

// ServeHTTP implements the http.Handler interface.
func (h *OnboardingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// The API Gateway is expected to validate the JWT and pass the Clerk User ID.
	// For this implementation, we assume it's in a header like "X-Clerk-User-Id".
	clerkUserID := r.Header.Get("X-Clerk-User-Id")
	if clerkUserID == "" {
		http.Error(w, "Unauthorized: Clerk User ID missing", http.StatusUnauthorized)
		return
	}

	var req domain.OnboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Basic validation
	if req.Username == "" || req.UserType == "" {
		http.Error(w, "Username and user_type are required", http.StatusBadRequest)
		return
	}

	// Idempotent onboarding: if user already exists by Clerk ID, update contact info; otherwise create
	var internalUserID string
	existing, findErr := h.repo.FindByClerkUserID(r.Context(), clerkUserID)
	if findErr == nil && existing != nil {
		internalUserID = existing.ID
		_ = h.repo.UpdateContactInfo(r.Context(), existing.ID, &req.Email, &req.PhoneNumber)

		// Update full name if provided and user is personal type
		if req.UserType == domain.PersonalUser {
			firstName, _ := req.KYCData["firstName"].(string)
			lastName, _ := req.KYCData["lastName"].(string)
			middleName, _ := req.KYCData["middleName"].(string)
			maidenName, _ := req.KYCData["maidenName"].(string)

			// Construct full name from structured fields
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
				// Update full name in database
				_ = h.repo.UpdateAnchorCustomerInfo(r.Context(), existing.ID, "", &constructedFullName)
			}
		}

		// If Anchor customer already exists, don't re-publish create event
		if existing.AnchorCustomerID != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
            json.NewEncoder(w).Encode(map[string]any{
                "user_id":            existing.ID,
                "anchor_customer_id": existing.AnchorCustomerID,
                "status":             "tier1_already_created",
            })
			return
		}
	} else {
		// Extract and construct full name from structured KYC data for personal users
		var fullName *string
		if req.UserType == domain.PersonalUser {
			firstName, _ := req.KYCData["firstName"].(string)
			lastName, _ := req.KYCData["lastName"].(string)
			middleName, _ := req.KYCData["middleName"].(string)
			maidenName, _ := req.KYCData["maidenName"].(string)

			// Construct full name from structured fields
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
				fullName = &constructedFullName
			}
		}

		// Create user domain object
		newUser := &domain.User{
			ClerkUserID:  clerkUserID,
			Username:     req.Username,
			Email:        &req.Email,
			PhoneNumber:  &req.PhoneNumber,
			FullName:     fullName,
			Type:         req.UserType,
			AllowSending: req.UserType == domain.PersonalUser, // Merchants are receive-only by default
		}

		// Save user to the database
		createdID, err := h.repo.CreateUser(r.Context(), newUser)
		if err != nil {
			// Check if it's a unique constraint violation
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				http.Error(w, "Conflict: Username or email already exists", http.StatusConflict)
				return
			}
			http.Error(w, "Internal server error: could not create user", http.StatusInternalServerError)
			return
		}
		internalUserID = createdID
	}

    // Prepare KYC data for the event (Tier 1 base fields + any provided extras)
	eventKYC := map[string]interface{}{}
	for k, v := range req.KYCData {
		eventKYC[k] = v
	}
    // Ensure email and phoneNumber are present for Tier 1 processing downstream
    eventKYC["email"] = req.Email
    eventKYC["phoneNumber"] = req.PhoneNumber

	// Publish user.created event to RabbitMQ
	event := domain.UserCreatedEvent{
		UserID:  internalUserID,
		KYCData: eventKYC,
	}

	// Publish only if producer is available
	if h.producer != nil {
		if pubErr := h.producer.Publish(r.Context(), "user_events", "user.created", event); pubErr != nil {
			// This is a critical failure. The user is in our DB, but downstream services won't know.
			// This requires a compensation mechanism (e.g., a retry job, manual intervention).
			log.Printf("CRITICAL: Failed to publish user.created event for user %s. Manual intervention required.", internalUserID)
			// We still return a success to the client, as the user was created. The system must be resilient.
		}
	}

	// Respond to the client
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]string{"user_id": internalUserID, "status": "tier1_processing"})
}
