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
	"log"
	"net/http"

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
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	// Parse the user ID as UUID
	senderID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.P2PTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

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
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	// Parse the user ID as UUID
	senderID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.SelfTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

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

	// Parse the user ID as UUID
	userID, err := uuid.Parse(userIDStr)
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

	// Parse the user ID as UUID
	userID, err := uuid.Parse(userIDStr)
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

	// Parse the user ID as UUID
	userID, err := uuid.Parse(userIDStr)
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

	// Parse the user ID as UUID
	userID, err := uuid.Parse(userIDStr)
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

	// Parse the user ID as UUID
	userID, err := uuid.Parse(userIDStr)
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
