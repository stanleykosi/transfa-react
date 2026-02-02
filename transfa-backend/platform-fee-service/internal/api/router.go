/**
 * @description
 * HTTP router setup for the platform-fee service using go-chi/chi.
 */
package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter creates a new Chi router and registers platform-fee routes.
func NewRouter(h *Handler, jwksURL string, internalKey string) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Internal-API-Key"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Platform fee service is healthy"))
	})

	r.Route("/internal/platform-fees", func(r chi.Router) {
		r.Use(InternalAuthMiddleware(internalKey))
		r.Post("/invoices/generate", h.handleGenerateInvoices)
		r.Post("/attempts/run", h.handleRunChargeAttempts)
		r.Post("/delinquency/run", h.handleMarkDelinquent)
		r.Post("/invoices/{id}/charge", h.handleChargeInvoice)
		r.Get("/users/{userID}/status", h.handleGetUserStatusInternal)
	})

	r.Group(func(r chi.Router) {
		r.Use(ClerkAuthMiddleware(jwksURL))
		r.Get("/platform-fees/status", h.handleGetStatus)
		r.Get("/platform-fees/invoices", h.handleListInvoices)
	})

	return r
}
