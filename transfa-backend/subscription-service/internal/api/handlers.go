/**
 * @description
 * This file contains the HTTP handler functions for the subscription-service.
 * Handlers are responsible for parsing incoming requests, calling the appropriate
 * business logic in the service layer, and writing the HTTP response.
 */
package api

import (
	"encoding/json"
	"net/http"

	"github.com/transfa/subscription-service/internal/app"
)

// Handler holds the application service that handlers will interact with.
type Handler struct {
	service app.Service
}

// NewHandler creates a new Handler with the given service.
func NewHandler(service app.Service) *Handler {
	return &Handler{service: service}
}

// handleGetStatus handles the request to get a user's subscription status.
func (h *Handler) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	// Extract user ID from context (injected by middleware)
	userID, ok := UserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the service layer to get the subscription status
	status, err := h.service.GetStatus(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Respond with the status
	respondWithJSON(w, http.StatusOK, status)
}

// handleUpgrade handles the request to upgrade a user's subscription.
func (h *Handler) handleUpgrade(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the service to upgrade the subscription
	subscription, err := h.service.Upgrade(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, subscription)
}

// handleCancel handles the request to cancel a user's subscription renewal.
func (h *Handler) handleCancel(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the service to cancel the subscription (set auto_renew to false)
	subscription, err := h.service.Cancel(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, subscription)
}

// handleToggleAutoRenew handles the request to toggle a user's auto-renewal setting.
func (h *Handler) handleToggleAutoRenew(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse the request body
	var req struct {
		AutoRenew bool `json:"auto_renew"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Call the service to set the auto-renewal setting
	subscription, err := h.service.SetAutoRenew(r.Context(), userID, req.AutoRenew)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, subscription)
}

// respondWithJSON is a helper function to write JSON responses.
func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}
