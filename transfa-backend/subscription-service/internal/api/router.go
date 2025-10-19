/**
 * @description
 * This file sets up the HTTP router for the subscription-service using the go-chi/chi router.
 * It defines the API routes, applies middleware for logging, CORS, and authentication,
 * and maps the routes to their corresponding handler functions.
 */
package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter creates a new Chi router and registers the subscription-service routes.
func NewRouter(h *Handler, jwksURL string) *chi.Mux {
	r := chi.NewRouter()

	// Setup middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any major browsers
	}))

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Subscription service is healthy"))
	})

	// Protected routes that require authentication
	r.Group(func(r chi.Router) {
		// Use the Clerk JWT validation middleware
		r.Use(ClerkAuthMiddleware(jwksURL))

		r.Get("/status", h.handleGetStatus)
		r.Post("/upgrade", h.handleUpgrade)
		r.Post("/cancel", h.handleCancel)
	})

	return r
}
