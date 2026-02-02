/**
 * @description
 * Authentication and authorization middleware for the platform-fee service.
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

// UserIDContextKey is the key used to store the user ID in the request context.
type contextKey string

const UserIDContextKey = contextKey("userID")

// ClerkAuthMiddleware validates Clerk JWTs and injects the user ID into context.
func ClerkAuthMiddleware(jwksURL string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}

				kid, ok := token.Header["kid"].(string)
				if !ok {
					return nil, fmt.Errorf("kid not found in token header")
				}

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

			if !token.Valid {
				http.Error(w, "Invalid token", http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, "Invalid token claims", http.StatusUnauthorized)
				return
			}

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

			userID, ok := claims["sub"].(string)
			if !ok {
				http.Error(w, "User ID not found in token", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDContextKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// InternalAuthMiddleware validates optional internal API key for server-to-server calls.
func InternalAuthMiddleware(requiredKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if requiredKey == "" {
				next.ServeHTTP(w, r)
				return
			}

			provided := r.Header.Get("X-Internal-API-Key")
			if provided == "" || provided != requiredKey {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func getPublicKeyFromJWKS(jwksURL, kid string) (interface{}, error) {
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

	for _, key := range jwks.Keys {
		if key.Kid == kid {
			return parseRSAPublicKey(key.N, key.E)
		}
	}

	return nil, fmt.Errorf("key with kid %s not found", kid)
}

func parseRSAPublicKey(n, e string) (interface{}, error) {
	nb, err := base64.RawURLEncoding.DecodeString(n)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}
	eb, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}

	var exp uint64
	if len(eb) == 3 {
		exp = uint64(eb[0])<<16 | uint64(eb[1])<<8 | uint64(eb[2])
	} else {
		for _, b := range eb {
			exp = (exp << 8) | uint64(b)
		}
	}

	nInt := new(big.Int).SetBytes(nb)
	pub := &rsa.PublicKey{N: nInt, E: int(exp)}
	return pub, nil
}

// UserFromContext retrieves the user ID from the request context.
func UserFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDContextKey).(string)
	return userID, ok
}
