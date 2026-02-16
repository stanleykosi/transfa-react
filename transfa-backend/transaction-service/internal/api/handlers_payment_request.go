/**
 * @description
 * This file contains the HTTP handlers for all payment request-related endpoints.
 * These handlers are responsible for parsing incoming requests, calling the
 * business logic in the service layer, and writing the appropriate JSON responses.
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

func (h *TransactionHandlers) resolveAuthenticatedInternalUserID(r *http.Request) (uuid.UUID, int, string) {
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		return uuid.Nil, http.StatusUnauthorized, "Could not get user ID from context"
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		return uuid.Nil, http.StatusBadRequest, "User not found"
	}

	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		return uuid.Nil, http.StatusBadRequest, "Invalid user ID format"
	}

	return userID, 0, ""
}

func parseOptionalInt(raw string, defaultValue int) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	return value, nil
}

func normalizeIncomingPaymentRequestStatusFilter(raw string) (string, error) {
	status := strings.TrimSpace(strings.ToLower(raw))
	if status == "" {
		return "", nil
	}

	switch status {
	case "pending", "processing", "fulfilled", "declined":
		return status, nil
	default:
		return "", errors.New("invalid payment request status filter")
	}
}

// CreatePaymentRequestHandler handles the creation of a new payment request.
func (h *TransactionHandlers) CreatePaymentRequestHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	var payload domain.CreatePaymentRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	request, err := h.service.CreatePaymentRequest(r.Context(), userID, payload)
	if err != nil {
		switch {
		case errors.Is(err, app.ErrInvalidTransferAmount),
			errors.Is(err, app.ErrInvalidPaymentRequestType),
			errors.Is(err, app.ErrInvalidPaymentRequestTitle),
			errors.Is(err, app.ErrInvalidPaymentRequestDescription),
			errors.Is(err, app.ErrInvalidPaymentRequestRecipient),
			errors.Is(err, app.ErrSelfPaymentRequest):
			h.writeError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, store.ErrUserNotFound):
			h.writeError(w, http.StatusNotFound, "Recipient not found")
		default:
			log.Printf("level=error component=api endpoint=create_payment_request outcome=failed user_id=%s err=%v", userID, err)
			h.writeError(w, http.StatusInternalServerError, "Could not create payment request.")
		}
		return
	}

	h.writeJSON(w, http.StatusCreated, request)
}

// ListPaymentRequestsHandler handles listing payment requests for the authenticated user.
func (h *TransactionHandlers) ListPaymentRequestsHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	limit, err := parseOptionalInt(r.URL.Query().Get("limit"), 50)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid limit")
		return
	}
	offset, err := parseOptionalInt(r.URL.Query().Get("offset"), 0)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid offset")
		return
	}

	opts := domain.PaymentRequestListOptions{
		Limit:  limit,
		Offset: offset,
		Search: strings.TrimSpace(r.URL.Query().Get("q")),
	}

	requests, err := h.service.ListPaymentRequests(r.Context(), userID, opts)
	if err != nil {
		log.Printf("level=error component=api endpoint=list_payment_requests outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve payment requests.")
		return
	}

	h.writeJSON(w, http.StatusOK, requests)
}

// GetPaymentRequestByIDHandler handles fetching a single payment request by its ID.
func (h *TransactionHandlers) GetPaymentRequestByIDHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	requestIDStr := chi.URLParam(r, "id")
	requestID, err := uuid.Parse(requestIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payment request ID.")
		return
	}

	request, err := h.service.GetPaymentRequestByID(r.Context(), requestID, userID)
	if err != nil {
		log.Printf("level=error component=api endpoint=get_payment_request_by_id outcome=failed request_id=%s user_id=%s err=%v", requestID, userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve payment request.")
		return
	}

	if request == nil {
		h.writeError(w, http.StatusNotFound, "Payment request not found.")
		return
	}

	h.writeJSON(w, http.StatusOK, request)
}

// DeletePaymentRequestHandler soft-deletes a creator-owned payment request.
func (h *TransactionHandlers) DeletePaymentRequestHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	requestIDStr := chi.URLParam(r, "id")
	requestID, err := uuid.Parse(requestIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payment request ID.")
		return
	}

	deleted, err := h.service.DeletePaymentRequest(r.Context(), requestID, userID)
	if err != nil {
		log.Printf("level=error component=api endpoint=delete_payment_request outcome=failed request_id=%s user_id=%s err=%v", requestID, userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not delete payment request.")
		return
	}
	if !deleted {
		h.writeError(w, http.StatusNotFound, "Payment request not found.")
		return
	}

	h.writeJSON(w, http.StatusNoContent, nil)
}

// ListIncomingPaymentRequestsHandler lists incoming (recipient-side) payment requests.
func (h *TransactionHandlers) ListIncomingPaymentRequestsHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	limit, err := parseOptionalInt(r.URL.Query().Get("limit"), 50)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid limit")
		return
	}
	offset, err := parseOptionalInt(r.URL.Query().Get("offset"), 0)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid offset")
		return
	}

	statusFilter, err := normalizeIncomingPaymentRequestStatusFilter(r.URL.Query().Get("status"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid status")
		return
	}

	opts := domain.PaymentRequestListOptions{
		Limit:  limit,
		Offset: offset,
		Search: strings.TrimSpace(r.URL.Query().Get("q")),
		Status: statusFilter,
	}

	requests, err := h.service.ListIncomingPaymentRequests(r.Context(), userID, opts)
	if err != nil {
		log.Printf("level=error component=api endpoint=list_incoming_payment_requests outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve incoming payment requests.")
		return
	}

	h.writeJSON(w, http.StatusOK, requests)
}

// GetIncomingPaymentRequestByIDHandler retrieves one incoming payment request.
func (h *TransactionHandlers) GetIncomingPaymentRequestByIDHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payment request ID.")
		return
	}

	request, err := h.service.GetIncomingPaymentRequestByID(r.Context(), requestID, userID)
	if err != nil {
		log.Printf("level=error component=api endpoint=get_incoming_payment_request outcome=failed request_id=%s user_id=%s err=%v", requestID, userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve incoming payment request.")
		return
	}
	if request == nil {
		h.writeError(w, http.StatusNotFound, "Payment request not found.")
		return
	}

	h.writeJSON(w, http.StatusOK, request)
}

// PayIncomingPaymentRequestHandler settles an incoming request by paying it.
func (h *TransactionHandlers) PayIncomingPaymentRequestHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payment request ID.")
		return
	}

	var payload domain.PayIncomingPaymentRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	if !h.authorizeTransactionPIN(r, w, userID, payload.TransactionPIN) {
		return
	}

	result, err := h.service.PayIncomingPaymentRequest(r.Context(), requestID, userID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInsufficientFunds):
			h.writeError(w, http.StatusPaymentRequired, err.Error())
		case errors.Is(err, app.ErrInvalidTransferAmount),
			errors.Is(err, app.ErrInvalidDescription),
			errors.Is(err, app.ErrInvalidRecipient):
			h.writeError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, app.ErrPaymentRequestNotPending):
			h.writeError(w, http.StatusConflict, err.Error())
		case errors.Is(err, app.ErrPaymentRequestNotFound):
			h.writeError(w, http.StatusNotFound, err.Error())
		case errors.Is(err, store.ErrUserNotFound):
			h.writeError(w, http.StatusNotFound, "Request creator not found")
		default:
			log.Printf("level=error component=api endpoint=pay_incoming_payment_request outcome=failed request_id=%s payer_id=%s err=%v", requestID, userID, err)
			h.writeError(w, http.StatusInternalServerError, "Could not process payment request.")
		}
		return
	}

	response := map[string]interface{}{
		"request":     result.Request,
		"transaction": buildTransferInitiationResponse(result.Transaction, "Transfer initiated"),
	}
	h.writeJSON(w, http.StatusOK, response)
}

// DeclineIncomingPaymentRequestHandler declines one incoming request.
func (h *TransactionHandlers) DeclineIncomingPaymentRequestHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	requestID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payment request ID.")
		return
	}

	var payload domain.DeclineIncomingPaymentRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	request, err := h.service.DeclineIncomingPaymentRequest(r.Context(), requestID, userID, payload.Reason)
	if err != nil {
		switch {
		case errors.Is(err, app.ErrInvalidPaymentRequestDecline):
			h.writeError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, app.ErrPaymentRequestNotPending):
			h.writeError(w, http.StatusConflict, err.Error())
		case errors.Is(err, app.ErrPaymentRequestNotFound):
			h.writeError(w, http.StatusNotFound, err.Error())
		default:
			log.Printf("level=error component=api endpoint=decline_incoming_payment_request outcome=failed request_id=%s recipient_id=%s err=%v", requestID, userID, err)
			h.writeError(w, http.StatusInternalServerError, "Could not decline payment request.")
		}
		return
	}

	h.writeJSON(w, http.StatusOK, request)
}
