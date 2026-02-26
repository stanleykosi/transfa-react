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
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/transfa/account-service/internal/app"
	"github.com/transfa/account-service/internal/store"
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
	AccountNumber  string `json:"account_number"`
	BankCode       string `json:"bank_code"`
	TransactionPIN string `json:"transaction_pin"`
}

type VerifyBeneficiaryAccountRequest struct {
	AccountNumber string `json:"account_number"`
	BankCode      string `json:"bank_code"`
}

// VerifyBeneficiaryAccount resolves account details before linking a beneficiary.
func (h *BeneficiaryHandler) VerifyBeneficiaryAccount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req VerifyBeneficiaryAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	output, err := h.service.VerifyBeneficiaryAccount(r.Context(), app.VerifyBeneficiaryAccountInput{
		UserID:        userID,
		AccountNumber: req.AccountNumber,
		BankCode:      req.BankCode,
	})
	if err != nil {
		if errors.Is(err, app.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, app.ErrInvalidBeneficiaryVerificationInput) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, app.ErrBeneficiaryVerificationProvider) {
			http.Error(w, "Failed to verify beneficiary account. Please try again.", http.StatusBadGateway)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, output)
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
		UserID:         userID,
		AccountNumber:  req.AccountNumber,
		BankCode:       req.BankCode,
		TransactionPIN: req.TransactionPIN,
	}

	beneficiary, err := h.service.CreateBeneficiary(r.Context(), input)
	if err != nil {
		if errors.Is(err, app.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrTransactionPINNotSet) {
			http.Error(w, "Transaction PIN is not set. Please create your PIN first.", http.StatusPreconditionFailed)
			return
		}
		if errors.Is(err, app.ErrTransactionPINLocked) {
			http.Error(w, "Too many incorrect PIN attempts. Please wait and try again.", http.StatusLocked)
			return
		}
		if errors.Is(err, app.ErrInvalidTransactionPIN) {
			http.Error(w, "Invalid transaction PIN.", http.StatusUnauthorized)
			return
		}
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
		if errors.Is(err, app.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
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
	if beneficiaryID == "" {
		http.Error(w, "Beneficiary ID is required", http.StatusBadRequest)
		return
	}

	err := h.service.DeleteBeneficiary(r.Context(), userID, beneficiaryID)
	if err != nil {
		if errors.Is(err, app.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
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

// InternalAccountHandler holds dependencies for internal account-related handlers.
type InternalAccountHandler struct {
	service *app.AccountService
}

// NewInternalAccountHandler creates a new InternalAccountHandler.
func NewInternalAccountHandler(service *app.AccountService) *InternalAccountHandler {
	return &InternalAccountHandler{service: service}
}

// CreateMoneyDropAccountRequest defines the request payload for creating a money drop account.
type CreateMoneyDropAccountRequest struct {
	UserID string `json:"user_id"`
}

// CreateMoneyDropAccount handles the internal endpoint for creating a money drop account.
// This is a server-to-server endpoint (no authentication required for internal services).
func (h *InternalAccountHandler) CreateMoneyDropAccount(w http.ResponseWriter, r *http.Request) {
	var req CreateMoneyDropAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	account, err := h.service.CreateMoneyDropAccount(r.Context(), req.UserID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, account)
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
