package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

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

	// Create user domain object
	newUser := &domain.User{
		ClerkUserID:  clerkUserID,
		Username:     req.Username,
		Email:        &req.Email,
		PhoneNumber:  &req.PhoneNumber,
		Type:         req.UserType,
		AllowSending: req.UserType == domain.PersonalUser, // Merchants are receive-only by default
	}

	// Save user to the database
	internalUserID, err := h.repo.CreateUser(r.Context(), newUser)
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

	// Prepare KYC data for the event (Tier 0 base fields + any provided extras)
	eventKYC := map[string]interface{}{}
	for k, v := range req.KYCData {
		eventKYC[k] = v
	}
	// Ensure email and phoneNumber are present for Tier 0 processing downstream
	eventKYC["email"] = req.Email
	eventKYC["phoneNumber"] = req.PhoneNumber

	// Publish user.created event to RabbitMQ
	event := domain.UserCreatedEvent{
		UserID:  internalUserID,
		KYCData: eventKYC,
	}

	// In a real-world scenario, you would define your exchanges and routing keys in a config.
	err = h.producer.Publish(r.Context(), "user_events", "user.created", event)
	if err != nil {
		// This is a critical failure. The user is in our DB, but downstream services won't know.
		// This requires a compensation mechanism (e.g., a retry job, manual intervention).
		log.Printf("CRITICAL: Failed to publish user.created event for user %s. Manual intervention required.", internalUserID)
		// We still return a success to the client, as the user was created. The system must be resilient.
	}

	// Respond to the client
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"user_id": internalUserID, "status": "onboarding_initiated"})
}
