/**
 * @description
 * This file contains custom middleware for the HTTP router. Middlewares are used
 * to process requests before they reach the final handler, perfect for tasks like
 * authentication, logging, or adding context to a request.
 *
 * @dependencies
 * - context, net/http, strings: Standard Go libraries.
 */

package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// UserIDContextKey is a custom type for the context key to avoid collisions.
type UserIDContextKey string

const clerkUserIDKey UserIDContextKey = "clerkUserID"

// SimpleAuthMiddleware creates a middleware that extracts user ID from headers.
// This is a simplified version for development - in production, you would validate JWT tokens.
func SimpleAuthMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// For development, we'll use the X-User-Id header passed by the API Gateway
			// In production, this should validate JWT tokens from Clerk
			userID := r.Header.Get("X-User-Id")
			if userID == "" {
				// Fallback to Authorization header for direct testing
				authHeader := r.Header.Get("Authorization")
				if authHeader == "" {
					http.Error(w, "Authorization header required", http.StatusUnauthorized)
					return
				}

				tokenString := strings.TrimPrefix(authHeader, "Bearer ")
				if tokenString == authHeader {
					http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
					return
				}

				// For now, we'll use a placeholder user ID for testing
				// In production, you would validate the JWT and extract the user ID
				userID = "test-user-id"
			}

			// Add the user ID to the request context for downstream handlers.
			ctx := context.WithValue(r.Context(), clerkUserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ClerkAuthMiddleware creates a middleware that validates JWT tokens from Clerk.
func ClerkAuthMiddleware(jwksURL string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get the Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Authorization header required", http.StatusUnauthorized)
				return
			}

			// Extract the token from "Bearer <token>"
			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
				return
			}

			// Parse and validate the JWT token
			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				// Verify the signing method
				if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}

				// Get the key ID from the token header
				kid, ok := token.Header["kid"].(string)
				if !ok {
					return nil, fmt.Errorf("kid not found in token header")
				}

				// Fetch the public key from JWKS
				publicKey, err := getPublicKeyFromJWKS(jwksURL, kid)
				if err != nil {
					return nil, fmt.Errorf("failed to get public key: %w", err)
				}

				return publicKey, nil
			})

			if err != nil {
				http.Error(w, fmt.Sprintf("Invalid token: %v", err), http.StatusUnauthorized)
				return
			}

			// Check if token is valid
			if !token.Valid {
				http.Error(w, "Invalid token", http.StatusUnauthorized)
				return
			}

			// Extract user ID from claims
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, "Invalid token claims", http.StatusUnauthorized)
				return
			}

			// Get the user ID from the 'sub' claim (standard JWT claim for subject)
			userID, ok := claims["sub"].(string)
			if !ok {
				http.Error(w, "User ID not found in token", http.StatusUnauthorized)
				return
			}

			// Add the user ID to the request context
			ctx := context.WithValue(r.Context(), clerkUserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// getPublicKeyFromJWKS fetches the public key from Clerk's JWKS endpoint
func getPublicKeyFromJWKS(jwksURL, kid string) (interface{}, error) {
	// This is a simplified implementation
	// In production, you should cache the JWKS and implement proper key rotation
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(jwksURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Use string `json:"use"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, err
	}

	// Find the key with matching kid
	for _, key := range jwks.Keys {
		if key.Kid == kid {
			// Parse the RSA public key
			// This is a simplified version - you might want to use a proper JWKS library
			return parseRSAPublicKey(key.N, key.E)
		}
	}

	return nil, fmt.Errorf("key with kid %s not found", kid)
}

// parseRSAPublicKey parses RSA public key from modulus and exponent
func parseRSAPublicKey(n, e string) (interface{}, error) {
	// This is a simplified implementation
	// In production, use a proper RSA key parsing library
	return nil, fmt.Errorf("RSA key parsing not implemented - use a proper JWKS library")
}

// GetClerkUserID retrieves the Clerk User ID from the request context.
// Handlers should use this function to get the authenticated user's ID.
func GetClerkUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(clerkUserIDKey).(string)
	return userID, ok
}
