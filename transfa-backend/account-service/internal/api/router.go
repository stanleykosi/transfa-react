/**
 * @description
 * This file sets up the HTTP router for the account-service using the `chi`
 * routing library. It defines all the API routes and applies necessary middleware.
 *
 * @dependencies
 * - github.com/go-chi/chi/v5: The routing library.
 * - The service's internal packages for handlers and middleware.
 */
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/transfa/account-service/internal/app"
	"github.com/transfa/account-service/internal/config"
	"github.com/transfa/account-service/pkg/middleware"
)

// NewRouter creates and configures a new HTTP router.
func NewRouter(cfg *config.Config, service *app.AccountService) http.Handler {
	r := chi.NewRouter()

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	})

	beneficiaryHandler := NewBeneficiaryHandler(service)
	bankHandler := NewBankHandler(service)

	// Group routes that require authentication
	r.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(cfg))

		r.Route("/beneficiaries", func(r chi.Router) {
			r.Post("/", beneficiaryHandler.CreateBeneficiary)
			r.Get("/", beneficiaryHandler.ListBeneficiaries)
			r.Delete("/{id}", beneficiaryHandler.DeleteBeneficiary)
		})

		r.Route("/banks", func(r chi.Router) {
			r.Get("/", bankHandler.ListBanks)
		})
	})

	return r
}
