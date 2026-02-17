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
	"strings"

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

// transferInitiationResponse is sent back to the mobile client immediately after a transfer
// request has been accepted by the transaction-service. It mirrors the structure expected
// by the React Native app (`TransactionResponse` in src/types/api.ts) so that the frontend
// can reliably read the transaction identifier and other metadata without additional
// transformation.
type transferInitiationResponse struct {
	TransactionID    string  `json:"transaction_id"`
	Status           string  `json:"status"`
	Message          string  `json:"message"`
	Amount           int64   `json:"amount,omitempty"`
	Fee              int64   `json:"fee,omitempty"`
	AnchorTransferID *string `json:"anchor_transfer_id,omitempty"`
	TransferType     string  `json:"transfer_type,omitempty"`
	FailureReason    *string `json:"failure_reason,omitempty"`
	AnchorSessionID  *string `json:"anchor_session_id,omitempty"`
	AnchorReason     *string `json:"anchor_reason,omitempty"`
}

type bulkTransferFailureResponse struct {
	RecipientUsername string `json:"recipient_username"`
	Amount            int64  `json:"amount"`
	Description       string `json:"description"`
	Error             string `json:"error"`
}

type bulkTransferInitiationResponse struct {
	BatchID                 string                        `json:"batch_id"`
	Status                  string                        `json:"status"`
	Message                 string                        `json:"message"`
	TotalAmount             int64                         `json:"total_amount"`
	TotalFee                int64                         `json:"total_fee"`
	SuccessCount            int                           `json:"success_count"`
	FailureCount            int                           `json:"failure_count"`
	SuccessfulTransfers     []transferInitiationResponse  `json:"successful_transfers"`
	FailedTransfers         []bulkTransferFailureResponse `json:"failed_transfers"`
	SuccessfulTransactionID []string                      `json:"successful_transaction_ids"`
}

func buildTransferInitiationResponse(tx *domain.Transaction, message string) transferInitiationResponse {
	return transferInitiationResponse{
		TransactionID:    tx.ID.String(),
		Status:           tx.Status,
		Message:          message,
		Amount:           tx.Amount,
		Fee:              tx.Fee,
		AnchorTransferID: tx.AnchorTransferID,
		TransferType:     tx.TransferType,
		FailureReason:    tx.FailureReason,
		AnchorSessionID:  tx.AnchorSessionID,
		AnchorReason:     tx.AnchorReason,
	}
}

func (h *TransactionHandlers) authorizeTransactionPIN(r *http.Request, w http.ResponseWriter, userID uuid.UUID, pin string) bool {
	err := h.service.VerifyTransactionPIN(r.Context(), userID, pin)
	if err == nil {
		return true
	}

	if errors.Is(err, store.ErrTransactionPINNotSet) {
		h.writeError(w, http.StatusPreconditionFailed, "Transaction PIN is not set. Please create your PIN first.")
		return false
	}
	if errors.Is(err, app.ErrTransactionPINLocked) {
		h.writeError(w, http.StatusLocked, "Too many incorrect PIN attempts. Please wait and try again.")
		return false
	}
	if errors.Is(err, app.ErrInvalidTransactionPIN) {
		h.writeError(w, http.StatusUnauthorized, "Invalid transaction PIN.")
		return false
	}

	log.Printf("level=error component=api msg=\"transaction pin verification failed\" user_id=%s err=%v", userID, err)
	h.writeError(w, http.StatusInternalServerError, "Unable to verify transaction PIN")
	return false
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

	// Resolve Clerk user id (e.g., user_abc) to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=p2p_transfer outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	senderID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=p2p_transfer outcome=reject reason=invalid_user_id internal_user_id=%s", internalIDStr)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.P2PTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("level=warn component=api endpoint=p2p_transfer outcome=reject reason=invalid_json err=%v", err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	if !h.authorizeTransactionPIN(r, w, senderID, req.TransactionPIN) {
		return
	}

	log.Printf("level=info component=api endpoint=p2p_transfer outcome=accepted sender_id=%s recipient=%s amount=%d", senderID, req.RecipientUsername, req.Amount)

	// Call the core service logic.
	tx, err := h.service.ProcessP2PTransfer(r.Context(), senderID, req)
	if err != nil {
		log.Printf("level=warn component=api endpoint=p2p_transfer outcome=failed sender_id=%s err=%v", senderID, err)
		if errors.Is(err, store.ErrInsufficientFunds) {
			http.Error(w, err.Error(), http.StatusPaymentRequired)
			return
		}
		if errors.Is(err, store.ErrUserNotFound) {
			http.Error(w, "Recipient user not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, app.ErrInvalidTransferAmount) || errors.Is(err, app.ErrInvalidDescription) || errors.Is(err, app.ErrInvalidRecipient) || errors.Is(err, app.ErrSelfTransferNotAllowed) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	response := buildTransferInitiationResponse(tx, "Transfer initiated")
	h.writeJSON(w, http.StatusCreated, response)
}

// BulkP2PTransferHandler handles requests for multi-recipient peer-to-peer transfers.
func (h *TransactionHandlers) BulkP2PTransferHandler(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=bulk_p2p_transfer outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	senderID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=bulk_p2p_transfer outcome=reject reason=invalid_user_id internal_user_id=%s", internalIDStr)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.BulkP2PTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("level=warn component=api endpoint=bulk_p2p_transfer outcome=reject reason=invalid_json err=%v", err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	if !h.authorizeTransactionPIN(r, w, senderID, req.TransactionPIN) {
		return
	}

	log.Printf("level=info component=api endpoint=bulk_p2p_transfer outcome=accepted sender_id=%s transfer_count=%d", senderID, len(req.Transfers))

	result, err := h.service.ProcessBulkP2PTransfer(r.Context(), senderID, req.Transfers)
	if err != nil {
		log.Printf("level=warn component=api endpoint=bulk_p2p_transfer outcome=failed sender_id=%s err=%v", senderID, err)
		switch {
		case errors.Is(err, store.ErrInsufficientFunds):
			http.Error(w, err.Error(), http.StatusPaymentRequired)
			return
		case errors.Is(err, app.ErrBulkTransferEmpty),
			errors.Is(err, app.ErrBulkTransferLimit),
			errors.Is(err, app.ErrDuplicateRecipient),
			errors.Is(err, app.ErrInvalidTransferAmount),
			errors.Is(err, app.ErrInvalidDescription),
			errors.Is(err, app.ErrInvalidRecipient):
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		default:
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	successes := make([]transferInitiationResponse, 0, len(result.Successful))
	successfulTransactionIDs := make([]string, 0, len(result.Successful))
	failures := make([]bulkTransferFailureResponse, 0, len(result.Failed))
	var totalAmount int64
	var totalFee int64

	for _, tx := range result.Successful {
		successes = append(successes, buildTransferInitiationResponse(tx, "Transfer initiated"))
		successfulTransactionIDs = append(successfulTransactionIDs, tx.ID.String())
		totalAmount += tx.Amount
		totalFee += tx.Fee
	}
	for _, failed := range result.Failed {
		failures = append(failures, bulkTransferFailureResponse{
			RecipientUsername: failed.RecipientUsername,
			Amount:            failed.Amount,
			Description:       failed.Description,
			Error:             failed.Error,
		})
	}

	status := "completed"
	message := "All transfers initiated successfully"
	if len(result.Successful) == 0 {
		status = "failed"
		message = "All transfers failed"
	}
	if len(result.Successful) > 0 && len(result.Failed) > 0 {
		status = "partial_failed"
		message = "Some transfers failed while others were initiated"
	}

	response := bulkTransferInitiationResponse{
		BatchID:                 result.BatchID.String(),
		Status:                  status,
		Message:                 message,
		TotalAmount:             totalAmount,
		TotalFee:                totalFee,
		SuccessCount:            len(result.Successful),
		FailureCount:            len(result.Failed),
		SuccessfulTransfers:     successes,
		FailedTransfers:         failures,
		SuccessfulTransactionID: successfulTransactionIDs,
	}

	h.writeJSON(w, http.StatusOK, response)
}

// SelfTransferHandler handles requests for self-transfers (withdrawals).
func (h *TransactionHandlers) SelfTransferHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	// Resolve Clerk user id (e.g., user_abc) to internal UUID
	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=self_transfer outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	senderID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=self_transfer outcome=reject reason=invalid_user_id internal_user_id=%s", internalIDStr)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	var req domain.SelfTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("level=warn component=api endpoint=self_transfer outcome=reject reason=invalid_json err=%v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !h.authorizeTransactionPIN(r, w, senderID, req.TransactionPIN) {
		return
	}

	log.Printf("level=info component=api endpoint=self_transfer outcome=accepted sender_id=%s beneficiary_id=%s amount=%d", senderID, req.BeneficiaryID, req.Amount)

	// Call the core service logic.
	tx, err := h.service.ProcessSelfTransfer(r.Context(), senderID, req)
	if err != nil {
		log.Printf("level=warn component=api endpoint=self_transfer outcome=failed sender_id=%s err=%v", senderID, err)
		if errors.Is(err, store.ErrInsufficientFunds) {
			http.Error(w, err.Error(), http.StatusPaymentRequired)
			return
		}
		if errors.Is(err, store.ErrBeneficiaryNotFound) {
			http.Error(w, "Beneficiary not found or does not belong to user", http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrPlatformFeeDelinquent) {
			http.Error(w, "Platform fee overdue: external transfers are disabled", http.StatusForbidden)
			return
		}
		if errors.Is(err, app.ErrInvalidTransferAmount) || errors.Is(err, app.ErrInvalidDescription) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	response := buildTransferInitiationResponse(tx, "Transfer initiated")
	h.writeJSON(w, http.StatusCreated, response)
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
		log.Printf("level=warn component=api endpoint=list_beneficiaries outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
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
		log.Printf("level=error component=api endpoint=list_beneficiaries outcome=failed user_id=%s err=%v", userID, err)
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
		log.Printf("level=warn component=api endpoint=get_default_beneficiary outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
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
		log.Printf("level=error component=api endpoint=get_default_beneficiary outcome=failed user_id=%s err=%v", userID, err)
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
		log.Printf("level=warn component=api endpoint=set_default_beneficiary outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
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
		log.Printf("level=error component=api endpoint=set_default_beneficiary outcome=failed user_id=%s beneficiary_id=%s err=%v", userID, req.BeneficiaryID, err)
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
		log.Printf("level=warn component=api endpoint=get_receiving_preference outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
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
		log.Printf("level=error component=api endpoint=get_receiving_preference outcome=failed user_id=%s err=%v", userID, err)
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
		log.Printf("level=warn component=api endpoint=update_receiving_preference outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
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
		log.Printf("level=error component=api endpoint=update_receiving_preference outcome=failed user_id=%s err=%v", userID, err)
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
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_balance outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_balance outcome=reject reason=invalid_user_id internal_user_id=%s err=%v", internalIDStr, err)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Get user's account balance
	balance, err := h.service.GetAccountBalance(r.Context(), userID)
	if err != nil {
		if errors.Is(err, store.ErrAccountNotFound) {
			log.Printf("level=warn component=api endpoint=get_balance outcome=not_found user_id=%s", userID)
			http.Error(w, "Account not found", http.StatusNotFound)
			return
		}
		log.Printf("level=error component=api endpoint=get_balance outcome=failed user_id=%s err=%v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the account balance
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(balance)
}

// GetFeesHandler returns the currently configured transaction fees.
func (h *TransactionHandlers) GetFeesHandler(w http.ResponseWriter, r *http.Request) {
	fees := map[string]int64{
		"p2p_fee_kobo":        h.service.GetTransactionFee(),
		"self_fee_kobo":       h.service.GetTransactionFee(),
		"money_drop_fee_kobo": h.service.GetMoneyDropFee(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(fees)
}

// GetTransactionHistoryHandler handles requests to get user's transaction history.
func (h *TransactionHandlers) GetTransactionHistoryHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		http.Error(w, "Could not get user ID from context", http.StatusInternalServerError)
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_history outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_history outcome=reject reason=invalid_user_id internal_user_id=%s err=%v", internalIDStr, err)
		http.Error(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	// Get user's transaction history
	transactions, err := h.service.GetTransactionHistory(r.Context(), userID)
	if err != nil {
		log.Printf("level=error component=api endpoint=get_history outcome=failed user_id=%s err=%v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Respond with the transaction history
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(transactions)
}

// GetTransactionHistoryWithUserHandler handles requests for bilateral history with one username.
func (h *TransactionHandlers) GetTransactionHistoryWithUserHandler(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		h.writeError(w, http.StatusInternalServerError, "Could not get user ID from context")
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		log.Printf("level=warn component=api endpoint=get_history_with_user outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
		h.writeError(w, http.StatusBadRequest, "User not found")
		return
	}

	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	username := strings.TrimSpace(chi.URLParam(r, "username"))
	if username == "" {
		h.writeError(w, http.StatusBadRequest, "Username is required")
		return
	}

	limit, err := parseOptionalInt(r.URL.Query().Get("limit"), 20)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid limit")
		return
	}
	offset, err := parseOptionalInt(r.URL.Query().Get("offset"), 0)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid offset")
		return
	}

	counterparty, transactions, err := h.service.GetTransactionHistoryWithUser(r.Context(), userID, username, limit, offset)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrUserNotFound):
			h.writeError(w, http.StatusNotFound, "User not found")
		case errors.Is(err, app.ErrInvalidRecipient):
			h.writeError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, app.ErrSelfTransferNotAllowed):
			h.writeError(w, http.StatusBadRequest, "Cannot view bilateral history with yourself")
		default:
			log.Printf("level=error component=api endpoint=get_history_with_user outcome=failed user_id=%s counterparty=%s err=%v", userID, username, err)
			h.writeError(w, http.StatusInternalServerError, "Internal server error")
		}
		return
	}

	shareableLink := fmt.Sprintf("https://trytransfa.com/%s", strings.TrimLeft(strings.TrimSpace(counterparty.Username), "_"))
	response := map[string]interface{}{
		"user": map[string]interface{}{
			"id":        counterparty.ID.String(),
			"username":  counterparty.Username,
			"full_name": counterparty.FullName,
		},
		"shareable_link": shareableLink,
		"transactions":   transactions,
	}

	h.writeJSON(w, http.StatusOK, response)
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
		log.Printf("level=warn component=api endpoint=get_transaction_by_id outcome=reject reason=user_resolution_failed clerk_user_id=%s err=%v", userIDStr, err)
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
		log.Printf("level=error component=api endpoint=get_transaction_by_id outcome=failed transaction_id=%s user_id=%s err=%v", transactionID, requestorID, err)
		h.writeError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.writeJSON(w, http.StatusOK, tx)
}

// PlatformFeeHandler handles internal requests to debit platform fees.
// This is called by the platform-fee service for monthly billing.
func (h *TransactionHandlers) PlatformFeeHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID    string `json:"user_id"`
		Amount    int64  `json:"amount"`
		Reason    string `json:"reason"`
		InvoiceID string `json:"invoice_id"`
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

	if req.Reason == "" {
		req.Reason = "Monthly Platform Fee"
	}

	// Call the core service logic to debit the platform fee
	tx, err := h.service.ProcessPlatformFee(r.Context(), userID, req.Amount, req.Reason)
	if err != nil {
		if req.InvoiceID != "" {
			log.Printf("level=warn component=api endpoint=platform_fee outcome=failed user_id=%s invoice_id=%s err=%v", userID, req.InvoiceID, err)
		} else {
			log.Printf("level=warn component=api endpoint=platform_fee outcome=failed user_id=%s err=%v", userID, err)
		}
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
