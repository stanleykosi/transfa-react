/**
 * @description
 * This file sets up the HTTP router for the transaction-service. It defines the API
 * endpoints, associates them with their corresponding handlers, and applies any
 * necessary middleware, such as for authentication.
 *
 * @dependencies
 * - net/http: Standard Go library for HTTP functionality.
 * - github.com/go-chi/chi/v5: A lightweight and idiomatic router for Go.
 */

package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// TransactionRoutes creates and returns a new router for the transaction service.
func TransactionRoutes(h *TransactionHandlers, jwksURL string) http.Handler {
	r := chi.NewRouter()

	// Add standard middleware for logging, panic recovery, and timeouts.
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	})

	// Group routes that require authentication.
	r.Group(func(r chi.Router) {
		// Apply JWT authentication middleware for production
		r.Use(ClerkAuthMiddleware(jwksURL))

		// Define the protected API endpoints.
		r.Post("/p2p", h.P2PTransferHandler)
		r.Post("/self-transfer", h.SelfTransferHandler)

		// Beneficiary management endpoints
		r.Get("/beneficiaries", h.ListBeneficiariesHandler)
		r.Get("/beneficiaries/default", h.GetDefaultBeneficiaryHandler)
		r.Put("/beneficiaries/default", h.SetDefaultBeneficiaryHandler)

		// Receiving preference endpoints
		r.Get("/receiving-preference", h.GetReceivingPreferenceHandler)
		r.Put("/receiving-preference", h.UpdateReceivingPreferenceHandler)
	})

	return r
}
