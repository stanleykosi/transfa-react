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
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// UserIDContextKey is a custom type for the context key to avoid collisions.
type UserIDContextKey string

const clerkUserIDKey UserIDContextKey = "clerkUserID"

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

			// Optional audience / issuer enforcement via env
			if expectedAud := os.Getenv("CLERK_AUDIENCE"); expectedAud != "" {
				if aud, ok := claims["aud"].(string); !ok || aud != expectedAud {
					http.Error(w, "Invalid audience", http.StatusUnauthorized)
					return
				}
			}
			if expectedIss := os.Getenv("CLERK_ISSUER"); expectedIss != "" {
				if iss, ok := claims["iss"].(string); !ok || iss != expectedIss {
					http.Error(w, "Invalid issuer", http.StatusUnauthorized)
					return
				}
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
			return parseRSAPublicKey(key.N, key.E)
		}
	}

	return nil, fmt.Errorf("key with kid %s not found", kid)
}

// parseRSAPublicKey parses RSA public key from modulus and exponent
func parseRSAPublicKey(n, e string) (interface{}, error) {
	// Decode base64url modulus and exponent
	nb, err := base64.RawURLEncoding.DecodeString(n)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}
	eb, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}

	// Convert exponent bytes to int
	var exp uint64
	if len(eb) == 3 {
		// Common case for 65537
		exp = uint64(eb[0])<<16 | uint64(eb[1])<<8 | uint64(eb[2])
	} else {
		// General case
		for _, b := range eb {
			exp = (exp << 8) | uint64(b)
		}
	}

	nInt := new(big.Int).SetBytes(nb)
	pub := &rsa.PublicKey{
		N: nInt,
		E: int(exp),
	}
	return pub, nil
}

// GetClerkUserID retrieves the Clerk User ID from the request context.
// Handlers should use this function to get the authenticated user's ID.
func GetClerkUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(clerkUserIDKey).(string)
	return userID, ok
}
