/**
 * @description
 * This file contains HTTP handlers for Money Drop endpoints.
 * Handlers are responsible for parsing incoming requests, calling the appropriate
 * methods on the application service, and writing the HTTP response.
 *
 * @dependencies
 * - encoding/json, log, net/http: Standard Go libraries.
 * - github.com/go-chi/chi/v5: For route parameters.
 * - internal/app, internal/domain, internal/store: For service logic, models, and custom errors.
 */

package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
)

// CreateMoneyDropHandler handles requests to create a new money drop.
func (h *TransactionHandlers) CreateMoneyDropHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Could not get user ID from context")
		return
	}

	// Resolve Clerk user id to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=create_money_drop outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		h.writeError(w, http.StatusBadRequest, "User not found")
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	var req domain.CreateMoneyDropRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate request
	if req.AmountPerClaim <= 0 {
		h.writeError(w, http.StatusBadRequest, "Amount per claim must be greater than 0")
		return
	}
	if req.NumberOfPeople <= 0 {
		h.writeError(w, http.StatusBadRequest, "Number of people must be greater than 0")
		return
	}
	if req.ExpiryInMinutes <= 0 {
		h.writeError(w, http.StatusBadRequest, "Expiry time must be greater than 0")
		return
	}

	// Create the money drop
	response, err := h.service.CreateMoneyDrop(r.Context(), userID, req)
	if err != nil {
		log.Printf("level=warn component=api endpoint=create_money_drop outcome=failed user_id=%s err=%v", userID, err)
		if err.Error() == "insufficient funds in primary wallet" {
			h.writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		h.writeError(w, http.StatusInternalServerError, "Failed to create money drop")
		return
	}

	h.writeJSON(w, http.StatusCreated, response)
}

// ClaimMoneyDropHandler handles requests to claim a money drop.
func (h *TransactionHandlers) ClaimMoneyDropHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Could not get user ID from context")
		return
	}

	// Resolve Clerk user id to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=claim_money_drop outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		h.writeError(w, http.StatusBadRequest, "User not found")
		return
	}
	claimantID, err := uuid.Parse(internalIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	// Get drop ID from URL parameter
	dropIDStr := chi.URLParam(r, "drop_id")
	dropID, err := uuid.Parse(dropIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid money drop ID format")
		return
	}

	// Process the claim
	response, err := h.service.ClaimMoneyDrop(r.Context(), claimantID, dropID)
	if err != nil {
		log.Printf("level=warn component=api endpoint=claim_money_drop outcome=failed claimant_id=%s drop_id=%s err=%v", claimantID, dropID, err)
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, response)
}

// GetMoneyDropDetailsHandler handles requests to get details about a money drop.
func (h *TransactionHandlers) GetMoneyDropDetailsHandler(w http.ResponseWriter, r *http.Request) {
	// Get drop ID from URL parameter
	dropIDStr := chi.URLParam(r, "drop_id")
	dropID, err := uuid.Parse(dropIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid money drop ID format")
		return
	}

	// Get drop details
	details, err := h.service.GetMoneyDropDetails(r.Context(), dropID)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_money_drop_details outcome=failed drop_id=%s err=%v", dropID, err)
		h.writeError(w, http.StatusNotFound, "Money drop not found")
		return
	}

	h.writeJSON(w, http.StatusOK, details)
}

// RefundMoneyDropHandler handles internal requests to refund a money drop.
// This is called by the scheduler-service and doesn't require authentication.
func (h *TransactionHandlers) RefundMoneyDropHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("level=info component=api endpoint=refund_money_drop outcome=accepted path=%s", r.URL.Path)

	var req struct {
		DropID    string `json:"drop_id"`
		CreatorID string `json:"creator_id"`
		Amount    int64  `json:"amount"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("level=warn component=api endpoint=refund_money_drop outcome=reject reason=invalid_json err=%v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("level=info component=api endpoint=refund_money_drop msg=\"processing request\" drop_id=%s creator_id=%s amount=%d", req.DropID, req.CreatorID, req.Amount)

	dropID, err := uuid.Parse(req.DropID)
	if err != nil {
		http.Error(w, "Invalid drop ID format", http.StatusBadRequest)
		return
	}

	creatorID, err := uuid.Parse(req.CreatorID)
	if err != nil {
		http.Error(w, "Invalid creator ID format", http.StatusBadRequest)
		return
	}

	// Process the refund
	if err := h.service.RefundMoneyDrop(r.Context(), dropID, creatorID, req.Amount); err != nil {
		log.Printf("level=warn component=api endpoint=refund_money_drop outcome=failed drop_id=%s creator_id=%s err=%v", dropID, creatorID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Refund processed successfully"))
}
