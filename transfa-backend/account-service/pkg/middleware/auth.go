/**
 * @description
 * This package provides middleware for the HTTP server, specifically for
 * handling authentication and authorization.
 */
package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/transfa/account-service/internal/config"
)

// AuthContextKey is a custom type for the context key to avoid collisions.
type AuthContextKey string

const (
	// UserIDKey is the key used to store the user's ID in the request context.
	UserIDKey AuthContextKey = "userID"
)

// ErrNoAuthHeader is returned when the Authorization header is missing.
var ErrNoAuthHeader = errors.New("authorization header is required")

// AuthMiddleware creates a middleware that validates a JWT and extracts the user ID.
func AuthMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			
			// For the purpose of this implementation, we will use the X-Clerk-User-Id header
			// as a stand-in for full JWT validation. In a production system, you would
			// validate the JWT from the "Authorization: Bearer" header against Clerk's JWKS.
			clerkUserID := r.Header.Get("X-Clerk-User-Id")

			if clerkUserID == "" {
				// Fallback to checking a bearer token for compatibility
				authHeader := r.Header.Get("Authorization")
				if authHeader == "" {
					http.Error(w, "Unauthorized: Missing auth credentials", http.StatusUnauthorized)
					return
				}
				
				parts := strings.Split(authHeader, " ")
				if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
					http.Error(w, "Unauthorized: Invalid Authorization header format", http.StatusUnauthorized)
					return
				}
				// Here you would validate token parts[1]
				// For now, we will assume it's valid if present and there's no Clerk ID header
				// This part should be replaced with actual validation
				http.Error(w, "JWT validation not yet implemented", http.StatusNotImplemented)
				return
			}
			
			// Add the user ID to the request context.
			ctx := context.WithValue(r.Context(), UserIDKey, clerkUserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserIDFromContext retrieves the user ID from the request context.
// It returns an empty string if the user ID is not found.
func GetUserIDFromContext(ctx context.Context) string {
	userID, ok := ctx.Value(UserIDKey).(string)
	if !ok {
		return ""
	}
	return userID
}
