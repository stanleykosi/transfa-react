/**
 * @description
 * This file contains the HTTP handlers for all payment request-related endpoints.
 * These handlers are responsible for parsing incoming requests, calling the
 * business logic in the service layer, and writing the appropriate JSON responses.
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

// CreatePaymentRequestHandler handles the creation of a new payment request.
// @Summary Create a payment request
// @Description Creates a new payment request for the authenticated user.
// @Tags Payment Requests
// @Accept json
// @Produce json
// @Param request body domain.CreatePaymentRequestPayload true "Payment Request Payload"
// @Success 201 {object} domain.PaymentRequest
// @Failure 400 {object} ErrorResponse "Invalid request payload"
// @Failure 401 {object} ErrorResponse "Unauthorized"
// @Failure 500 {object} ErrorResponse "Internal server error"
// @Router /payment-requests [post]
func (h *TransactionHandlers) CreatePaymentRequestHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Could not get user ID from context")
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "User not found")
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	var payload domain.CreatePaymentRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	// TODO: Add validation for the payload struct.

	// Call the service to create the payment request.
	request, err := h.service.CreatePaymentRequest(r.Context(), userID, payload)
	if err != nil {
		log.Printf("level=error component=api endpoint=create_payment_request outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not create payment request.")
		return
	}

	h.writeJSON(w, http.StatusCreated, request)
}

// ListPaymentRequestsHandler handles listing all payment requests for the authenticated user.
// @Summary List payment requests
// @Description Retrieves a list of all payment requests created by the authenticated user.
// @Tags Payment Requests
// @Produce json
// @Success 200 {array} domain.PaymentRequest
// @Failure 401 {object} ErrorResponse "Unauthorized"
// @Failure 500 {object} ErrorResponse "Internal server error"
// @Router /payment-requests [get]
func (h *TransactionHandlers) ListPaymentRequestsHandler(w http.ResponseWriter, r *http.Request) {
	// Retrieve the authenticated user's ID from the context.
	userIDStr, ok := GetClerkUserID(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Could not get user ID from context")
		return
	}

	internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "User not found")
		return
	}
	userID, err := uuid.Parse(internalIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	// Call the service to get the list of requests.
	requests, err := h.service.ListPaymentRequests(r.Context(), userID)
	if err != nil {
		log.Printf("level=error component=api endpoint=list_payment_requests outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve payment requests.")
		return
	}

	h.writeJSON(w, http.StatusOK, requests)
}

// GetPaymentRequestByIDHandler handles fetching a single payment request by its ID.
// @Summary Get a payment request
// @Description Retrieves the details of a specific payment request by its ID.
// @Tags Payment Requests
// @Produce json
// @Param id path string true "Payment Request ID"
// @Success 200 {object} domain.PaymentRequest
// @Failure 400 {object} ErrorResponse "Invalid request ID"
// @Failure 404 {object} ErrorResponse "Payment request not found"
// @Failure 500 {object} ErrorResponse "Internal server error"
// @Router /payment-requests/{id} [get]
func (h *TransactionHandlers) GetPaymentRequestByIDHandler(w http.ResponseWriter, r *http.Request) {
	requestIDStr := chi.URLParam(r, "id")
	requestID, err := uuid.Parse(requestIDStr)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payment request ID.")
		return
	}

	// Call the service to get the request.
	request, err := h.service.GetPaymentRequestByID(r.Context(), requestID)
	if err != nil {
		log.Printf("level=error component=api endpoint=get_payment_request_by_id outcome=failed request_id=%s err=%v", requestID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve payment request.")
		return
	}

	if request == nil {
		h.writeError(w, http.StatusNotFound, "Payment request not found.")
		return
	}

	h.writeJSON(w, http.StatusOK, request)
}
