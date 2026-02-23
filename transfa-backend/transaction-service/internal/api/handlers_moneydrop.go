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
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/app"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
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
	if strings.TrimSpace(req.Title) == "" {
		h.writeError(w, http.StatusBadRequest, "Title is required")
		return
	}
	if req.TotalAmount <= 0 {
		h.writeError(w, http.StatusBadRequest, "Total amount must be greater than 0")
		return
	}
	if req.NumberOfPeople <= 0 {
		h.writeError(w, http.StatusBadRequest, "Number of people must be greater than 0")
		return
	}
	if req.ExpiryInMinutes <= 0 || req.ExpiryInMinutes > 1440 {
		h.writeError(w, http.StatusBadRequest, "Expiry time must be between 1 and 1440 minutes")
		return
	}
	if req.LockDrop && strings.TrimSpace(req.LockPassword) == "" {
		h.writeError(w, http.StatusBadRequest, "Drop password is required when lock drop is enabled")
		return
	}
	if !h.authorizeTransactionPIN(r, w, userID, req.TransactionPIN) {
		return
	}

	// Create the money drop
	response, err := h.service.CreateMoneyDrop(r.Context(), userID, req)
	if err != nil {
		log.Printf("level=warn component=api endpoint=create_money_drop outcome=failed user_id=%s err=%v", userID, err)
		switch {
		case errors.Is(err, app.ErrInvalidMoneyDropTitle),
			errors.Is(err, app.ErrInvalidMoneyDropTotalAmount),
			errors.Is(err, app.ErrInvalidMoneyDropPeopleCount),
			errors.Is(err, app.ErrInvalidMoneyDropExpiry),
			errors.Is(err, app.ErrMissingMoneyDropPassword),
			errors.Is(err, app.ErrInvalidMoneyDropPassword):
			h.writeError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, app.ErrMoneyDropPasswordEncryptionUnavailable):
			h.writeError(w, http.StatusServiceUnavailable, "Locked money drops are temporarily unavailable")
			return
		case strings.Contains(err.Error(), "must be divisible equally"),
			strings.Contains(err.Error(), "insufficient funds"):
			h.writeError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, store.ErrAccountNotFound):
			h.writeError(w, http.StatusBadRequest, "Primary account not found")
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

	var req domain.ClaimMoneyDropRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			h.writeError(w, http.StatusBadRequest, "Invalid request body")
			return
		}
	}

	// Process the claim
	response, err := h.service.ClaimMoneyDrop(r.Context(), claimantID, dropID, req)
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

// GetMoneyDropDashboardHandler returns active drops, history, and money drop account balance.
func (h *TransactionHandlers) GetMoneyDropDashboardHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	dashboard, err := h.service.GetMoneyDropDashboard(r.Context(), userID)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_money_drop_dashboard outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch money drop dashboard")
		return
	}

	h.writeJSON(w, http.StatusOK, dashboard)
}

// GetMoneyDropOwnerDetailsHandler returns full owner-facing details for a specific drop.
func (h *TransactionHandlers) GetMoneyDropOwnerDetailsHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	dropIDStr := chi.URLParam(r, "drop_id")
	dropID, err := uuid.Parse(dropIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid money drop ID format")
		return
	}

	claimersLimit := 20
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("claimers_limit")); rawLimit != "" {
		if parsed, parseErr := strconv.Atoi(rawLimit); parseErr == nil && parsed > 0 {
			claimersLimit = parsed
		}
	}

	details, err := h.service.GetMoneyDropOwnerDetails(r.Context(), userID, dropID, claimersLimit)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_money_drop_owner_details outcome=failed user_id=%s drop_id=%s err=%v", userID, dropID, err)
		if errors.Is(err, store.ErrMoneyDropNotFound) {
			h.writeError(w, http.StatusNotFound, "Money drop not found")
			return
		}
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch money drop details")
		return
	}

	h.writeJSON(w, http.StatusOK, details)
}

// RevealMoneyDropPasswordHandler reveals a lock password for a creator-owned drop
// after transaction PIN step-up authentication.
func (h *TransactionHandlers) RevealMoneyDropPasswordHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	dropIDStr := chi.URLParam(r, "drop_id")
	dropID, err := uuid.Parse(dropIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid money drop ID format")
		return
	}

	var req domain.RevealMoneyDropPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if !h.authorizeTransactionPIN(r, w, userID, req.TransactionPIN) {
		return
	}

	lockPassword, err := h.service.RevealMoneyDropPassword(r.Context(), userID, dropID)
	if err != nil {
		log.Printf("level=warn component=api endpoint=reveal_money_drop_password outcome=failed user_id=%s drop_id=%s err=%v", userID, dropID, err)
		if errors.Is(err, store.ErrMoneyDropNotFound) {
			h.writeError(w, http.StatusNotFound, "Money drop not found")
			return
		}
		if errors.Is(err, app.ErrMoneyDropPasswordEncryptionUnavailable) {
			h.writeError(w, http.StatusServiceUnavailable, "Drop password reveal is temporarily unavailable")
			return
		}
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, domain.RevealMoneyDropPasswordResponse{
		LockPassword: lockPassword,
	})
}

// GetMoneyDropClaimersHandler returns paginated claimers for a creator-owned drop.
func (h *TransactionHandlers) GetMoneyDropClaimersHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	dropIDStr := chi.URLParam(r, "drop_id")
	dropID, err := uuid.Parse(dropIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid money drop ID format")
		return
	}

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	limit := 20
	offset := 0
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		if parsed, parseErr := strconv.Atoi(rawLimit); parseErr == nil && parsed > 0 {
			limit = parsed
		}
	}
	if rawOffset := strings.TrimSpace(r.URL.Query().Get("offset")); rawOffset != "" {
		if parsed, parseErr := strconv.Atoi(rawOffset); parseErr == nil && parsed >= 0 {
			offset = parsed
		}
	}

	response, err := h.service.GetMoneyDropClaimers(r.Context(), userID, dropID, search, limit, offset)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_money_drop_claimers outcome=failed user_id=%s drop_id=%s err=%v", userID, dropID, err)
		if errors.Is(err, store.ErrMoneyDropNotFound) {
			h.writeError(w, http.StatusNotFound, "Money drop not found")
			return
		}
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch money drop claimers")
		return
	}

	h.writeJSON(w, http.StatusOK, response)
}

// EndMoneyDropHandler allows a creator to end an active money drop immediately.
func (h *TransactionHandlers) EndMoneyDropHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	dropIDStr := chi.URLParam(r, "drop_id")
	dropID, err := uuid.Parse(dropIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid money drop ID format")
		return
	}

	result, err := h.service.EndMoneyDrop(r.Context(), userID, dropID)
	if err != nil {
		log.Printf("level=warn component=api endpoint=end_money_drop outcome=failed user_id=%s drop_id=%s err=%v", userID, dropID, err)
		switch {
		case errors.Is(err, store.ErrMoneyDropNotFound):
			h.writeError(w, http.StatusNotFound, "Money drop not found")
		default:
			h.writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

// GetClaimedMoneyDropsHandler returns drops claimed by the authenticated user.
func (h *TransactionHandlers) GetClaimedMoneyDropsHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	response, err := h.service.GetClaimedMoneyDropHistory(r.Context(), userID)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_claimed_money_drops outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch claimed drops")
		return
	}

	h.writeJSON(w, http.StatusOK, response)
}

// ReconcileMoneyDropClaimsHandler retries stale pending claim payouts that were
// explicitly marked as retry-requested and still have no Anchor transfer ID.
func (h *TransactionHandlers) ReconcileMoneyDropClaimsHandler(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeInternalRequest(w, r) {
		return
	}

	var req struct {
		Limit int `json:"limit"`
	}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			h.writeError(w, http.StatusBadRequest, "Invalid request body")
			return
		}
	}

	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		if parsed, parseErr := strconv.Atoi(rawLimit); parseErr == nil && parsed > 0 {
			req.Limit = parsed
		}
	}

	result, err := h.service.ReconcilePendingMoneyDropClaims(r.Context(), req.Limit)
	if err != nil {
		log.Printf("level=error component=api endpoint=reconcile_money_drop_claims outcome=failed err=%v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to reconcile money drop claims")
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

// RefundMoneyDropHandler handles internal requests to refund a money drop.
// This is called by internal trusted services (scheduler).
func (h *TransactionHandlers) RefundMoneyDropHandler(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeInternalRequest(w, r) {
		return
	}

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
	if req.Amount < 0 {
		http.Error(w, "Invalid amount", http.StatusBadRequest)
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
