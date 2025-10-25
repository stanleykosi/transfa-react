/**
 * @description
 * This file contains the HTTP handlers for the transaction-service's API endpoints.
 * Handlers are responsible for parsing incoming requests, calling the appropriate
 * methods on the application service, and writing the HTTP response. They act as the
 * bridge between the web layer and the business logic layer.
 *
 * @dependencies
 * - encoding/json, log, net/http: Standard Go libraries.
 * - internal/app, internal/domain, internal/store: For service logic, models, and custom errors.
 */

package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/app"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
)

// TransactionHandlers holds the application service that handlers will use.
type TransactionHandlers struct {
	service *app.Service
}

// NewTransactionHandlers creates a new instance of TransactionHandlers.
func NewTransactionHandlers(service *app.Service) *TransactionHandlers {
	return &TransactionHandlers{service: service}
}

// P2PTransferHandler handles requests for peer-to-peer transfers.
func (h *TransactionHandlers) P2PTransferHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		log.Printf("P2P Transfer: Could not get user ID from context")
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	// Resolve Clerk user id (e.g., user_abc) to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("P2P Transfer: Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	senderID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("P2P Transfer: Invalid user ID format: %s", internalIDStr)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.P2PTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("P2P Transfer JSON decode error: %v", err)
		log.Printf("Request headers: %v", r.Header)
		log.Printf("Request body: %v", r.Body)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("P2P Transfer request: sender=%s, recipient=%s, amount=%d", senderID, req.RecipientUsername, req.Amount)

	// Call the core service logic.
	tx, err := h.service.ProcessP2PTransfer(r.Context(), senderID, req)
	if err != nil {
		log.Printf("P2P Transfer failed for user %s: %v", senderID, err)
		if errors.Is(err, store.ErrInsufficientFunds) {
			http.Error(w, err.Error(), http.StatusPaymentRequired)
			return
		}
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "Recipient user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the created transaction.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

// SelfTransferHandler handles requests for self-transfers (withdrawals).
func (h *TransactionHandlers) SelfTransferHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		log.Printf("Self Transfer: Could not get user ID from context")
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	// Resolve Clerk user id (e.g., user_abc) to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Self Transfer: Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	senderID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("Self Transfer: Invalid user ID format: %s", internalIDStr)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.SelfTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Self Transfer JSON decode error: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("Self Transfer request: sender=%s, beneficiary=%s, amount=%d", senderID, req.BeneficiaryID, req.Amount)

	// Call the core service logic.
	tx, err := h.service.ProcessSelfTransfer(r.Context(), senderID, req)
	if err != nil {
		log.Printf("Self Transfer failed for user %s: %v", senderID, err)
		if errors.Is(err, store.ErrInsufficientFunds) {
			http.Error(w, err.Error(), http.StatusPaymentRequired)
			return
		}
		if errors.Is(err, store.ErrBeneficiaryNotFound) {
			http.Error(w, "Beneficiary not found or does not belong to user", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the created transaction.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

// ListBeneficiariesHandler handles requests to list user's beneficiaries.
func (h *TransactionHandlers) ListBeneficiariesHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	// Resolve Clerk user id (e.g., user_abc) to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Get user's beneficiaries
	beneficiaries, err := h.service.GetUserBeneficiaries(r.Context(), userID)
	if err != nil {
		log.Printf("Failed to get beneficiaries for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the beneficiaries list
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(beneficiaries)
}

// GetDefaultBeneficiaryHandler handles requests to get user's default beneficiary.
func (h *TransactionHandlers) GetDefaultBeneficiaryHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Get user's default beneficiary using smart logic
	beneficiary, err := h.service.GetDefaultBeneficiary(r.Context(), userID)
	if err != nil {
		if errors.Is(err, store.ErrBeneficiaryNotFound) {
			http.Error(w, "No default beneficiary found", http.StatusNotFound)
			return
		}
		log.Printf("Failed to get default beneficiary for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the default beneficiary
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(beneficiary)
}

// SetDefaultBeneficiaryHandler handles requests to set a user's default beneficiary.
func (h *TransactionHandlers) SetDefaultBeneficiaryHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Parse the request body to get the beneficiary ID
	var req struct {
		BeneficiaryID uuid.UUID `json:"beneficiary_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Set the default beneficiary
	err = h.service.SetDefaultBeneficiary(r.Context(), userID, req.BeneficiaryID)
	if err != nil {
		if errors.Is(err, store.ErrBeneficiaryNotFound) {
			http.Error(w, "Beneficiary not found or does not belong to user", http.StatusNotFound)
			return
		}
		log.Printf("Failed to set default beneficiary for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with success
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Default beneficiary updated successfully"})
}

// GetReceivingPreferenceHandler handles requests to get user's receiving preference.
func (h *TransactionHandlers) GetReceivingPreferenceHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Get user's receiving preference
	preference, err := h.service.GetReceivingPreference(r.Context(), userID)
	if err != nil {
		log.Printf("Failed to get receiving preference for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the receiving preference
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(preference)
}

// UpdateReceivingPreferenceHandler handles requests to update user's receiving preference.
func (h *TransactionHandlers) UpdateReceivingPreferenceHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Parse the request body
	var req struct {
		UseExternalAccount   bool       `json:"use_external_account"`
		DefaultBeneficiaryID *uuid.UUID `json:"default_beneficiary_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update the receiving preference
	err = h.service.UpdateReceivingPreference(r.Context(), userID, req.UseExternalAccount, req.DefaultBeneficiaryID)
	if err != nil {
		if errors.Is(err, store.ErrBeneficiaryNotFound) {
			http.Error(w, "Beneficiary not found or does not belong to user", http.StatusNotFound)
			return
		}
		log.Printf("Failed to update receiving preference for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with success
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Receiving preference updated successfully"})
}

// GetAccountBalanceHandler handles requests to get user's account balance.
func (h *TransactionHandlers) GetAccountBalanceHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("GetAccountBalanceHandler called")

	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		log.Printf("Could not get user ID from context")
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	log.Printf("User ID from context: %s", userIDStr)

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("Invalid user ID format: %s, error: %v", internalIDStr, err)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	log.Printf("Parsed user ID: %s", userID)

	// Get user's account balance
	balance, err := h.service.GetAccountBalance(r.Context(), userID)
	if err != nil {
		if errors.Is(err, store.ErrAccountNotFound) {
			log.Printf("Account not found for user %s", userID)
			http.Error(w, "Account not found", http.StatusNotFound)
			return
		}
		log.Printf("Failed to get account balance for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully retrieved balance for user %s: %+v", userID, balance)

	// Respond with the account balance
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(balance)
}

// GetFeesHandler returns the currently configured transaction fees.
func (h *TransactionHandlers) GetFeesHandler(w http.ResponseWriter, r *http.Request) {
	fees := map[string]int64{
		"p2p_fee_kobo":  h.service.GetTransactionFee(),
		"self_fee_kobo": h.service.GetTransactionFee(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(fees)
}

// GetTransactionHistoryHandler handles requests to get user's transaction history.
func (h *TransactionHandlers) GetTransactionHistoryHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("GetTransactionHistoryHandler called")

	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		log.Printf("Could not get user ID from context")
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	log.Printf("User ID from context: %s", userIDStr)

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("Failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("Invalid user ID format: %s, error: %v", internalIDStr, err)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	log.Printf("Parsed user ID: %s", userID)

	// Get user's transaction history
	transactions, err := h.service.GetTransactionHistory(r.Context(), userID)
	if err != nil {
		log.Printf("Failed to get transaction history for user %s: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully retrieved %d transactions for user %s", len(transactions), userID)

	// Respond with the transaction history
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(transactions)
}

// GetTransactionByIDHandler handles requests to fetch an individual transaction by UUID.
func (h *TransactionHandlers) GetTransactionByIDHandler(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		h.writeError(w, http.StatusInternalServerError, "Could not get user ID from context")
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("GetTransactionByID: failed to resolve internal user id for clerk %s: %v", userIDStr, err)
		h.writeError(w, http.StatusBadRequest, "User not found")
		return
	}
	requestorID, err := uuid.Parse(internalIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	transactionIDStr := chi.URLParam(r, "id")
	if transactionIDStr == "" {
		h.writeError(w, http.StatusBadRequest, "Transaction ID is required")
		return
	}

	transactionID, err := uuid.Parse(transactionIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid transaction ID format")
		return
	}

	tx, err := h.service.GetTransactionByID(r.Context(), requestorID, transactionID)
	if err != nil {
		if errors.Is(err, store.ErrTransactionNotFound) {
			h.writeError(w, http.StatusNotFound, "Transaction not found")
			return
		}
		log.Printf("GetTransactionByID: failed to fetch transaction %s for user %s: %v", transactionID, requestorID, err)
		h.writeError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.writeJSON(w, http.StatusOK, tx)
}

// SubscriptionFeeHandler handles internal requests to debit subscription fees.
// This is called by the scheduler-service for monthly billing.
func (h *TransactionHandlers) SubscriptionFeeHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
		Amount int64  `json:"amount"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Parse the user ID as UUID
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Call the core service logic to debit the subscription fee
	tx, err := h.service.ProcessSubscriptionFee(r.Context(), userID, req.Amount, req.Reason)
	if err != nil {
		log.Printf("Subscription fee debit failed for user %s: %v", userID, err)
		if errors.Is(err, store.ErrInsufficientFunds) {
			http.Error(w, err.Error(), http.StatusPaymentRequired)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the created transaction
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

// writeJSON is a helper for writing JSON responses.
func (h *TransactionHandlers) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

// writeError is a helper for writing JSON error responses.
func (h *TransactionHandlers) writeError(w http.ResponseWriter, status int, message string) {
	h.writeJSON(w, status, map[string]string{"error": message})
}
