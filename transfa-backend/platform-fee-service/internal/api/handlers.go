/**
 * @description
 * HTTP handlers for the platform-fee service.
 */
package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/transfa/platform-fee-service/internal/app"
)

// Handler holds the application service that handlers will interact with.
type Handler struct {
	service app.Service
}

// NewHandler creates a new Handler with the given service.
func NewHandler(service app.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	status, err := h.service.GetStatus(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting platform fee status for user %s: %v", userID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, status)
}

func (h *Handler) handleListInvoices(w http.ResponseWriter, r *http.Request) {
	userID, ok := UserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	invoices, err := h.service.ListInvoices(r.Context(), userID)
	if err != nil {
		log.Printf("Error listing platform fee invoices for user %s: %v", userID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, invoices)
}

func (h *Handler) handleGenerateInvoices(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.GenerateMonthlyInvoices(r.Context())
	if err != nil {
		log.Printf("Error generating platform fee invoices: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) handleRunChargeAttempts(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.RunChargeAttempts(r.Context())
	if err != nil {
		log.Printf("Error running platform fee charge attempts: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) handleMarkDelinquent(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.MarkDelinquent(r.Context())
	if err != nil {
		log.Printf("Error marking delinquent invoices: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) handleChargeInvoice(w http.ResponseWriter, r *http.Request) {
	invoiceID := chi.URLParam(r, "id")
	if invoiceID == "" {
		http.Error(w, "Invoice ID is required", http.StatusBadRequest)
		return
	}

	result, err := h.service.ChargeInvoice(r.Context(), invoiceID)
	if err != nil {
		log.Printf("Error charging invoice %s: %v", invoiceID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, result)
}

func (h *Handler) handleGetUserStatusInternal(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if userID == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	status, err := h.service.GetStatusByUserID(r.Context(), userID)
	if err != nil {
		log.Printf("Error getting platform fee status for user %s: %v", userID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondWithJSON(w, http.StatusOK, status)
}

// respondWithJSON writes JSON responses.
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
