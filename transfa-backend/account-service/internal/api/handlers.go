/**
 * @description
 * This file defines the HTTP handlers for the account-service's API endpoints.
 * Handlers are responsible for parsing requests, calling the appropriate service
 * method, and writing the response.
 *
 * @dependencies
 * - Standard Go libraries for HTTP, JSON, etc.
 * - Chi router for URL parameter handling.
 * - The service's internal packages for app logic and middleware.
 */
package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/transfa/account-service/internal/app"
	"github.com/transfa/account-service/pkg/middleware"
)

// BeneficiaryHandler holds the dependencies for beneficiary-related handlers.
type BeneficiaryHandler struct {
	service *app.AccountService
}

// BankHandler holds the dependencies for bank-related handlers.
type BankHandler struct {
	service *app.AccountService
}

// NewBeneficiaryHandler creates a new BeneficiaryHandler.
func NewBeneficiaryHandler(service *app.AccountService) *BeneficiaryHandler {
	return &BeneficiaryHandler{service: service}
}

// NewBankHandler creates a new BankHandler.
func NewBankHandler(service *app.AccountService) *BankHandler {
	return &BankHandler{service: service}
}

// CreateBeneficiaryRequest defines the expected JSON body for creating a beneficiary.
type CreateBeneficiaryRequest struct {
	AccountNumber string `json:"account_number"`
	BankCode      string `json:"bank_code"`
}

// CreateBeneficiary handles the creation of a new beneficiary.
func (h *BeneficiaryHandler) CreateBeneficiary(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateBeneficiaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	input := app.CreateBeneficiaryInput{
		UserID:        userID,
		AccountNumber: req.AccountNumber,
		BankCode:      req.BankCode,
	}

	beneficiary, err := h.service.CreateBeneficiary(r.Context(), input)
	if err != nil {
		// Check if it's a linked account limit error (should be 400, not 500)
		if strings.Contains(err.Error(), "You can only add 1 linked account on free tier") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// All other errors remain as 500
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, beneficiary)
}

// ListBeneficiaries handles listing all beneficiaries for the authenticated user.
func (h *BeneficiaryHandler) ListBeneficiaries(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	beneficiaries, err := h.service.ListBeneficiaries(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, beneficiaries)
}

// DeleteBeneficiary handles the deletion of a specific beneficiary.
func (h *BeneficiaryHandler) DeleteBeneficiary(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	beneficiaryID := chi.URLParam(r, "id")

	err := h.service.DeleteBeneficiary(r.Context(), userID, beneficiaryID)
	if err != nil {
		// Differentiate between not found and other errors
		if err.Error() == "beneficiary not found or not owned by user" {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListBanks handles listing all supported banks.
func (h *BankHandler) ListBanks(w http.ResponseWriter, r *http.Request) {
	banks, err := h.service.ListBanks(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, banks)
}

// writeJSON is a helper to write JSON responses.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// If encoding fails, we can't send a JSON error, so just log it.
		http.Error(w, `{"error":"Failed to encode response"}`, http.StatusInternalServerError)
	}
}
