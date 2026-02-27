/**
 * @description
 * Authentication and authorization middleware for account-service.
 */
package middleware

import (
	"context"
	"crypto/rsa"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/transfa/account-service/internal/config"
)

// AuthContextKey is a custom type for context keys to avoid collisions.
type AuthContextKey string

const (
	// UserIDKey stores the Clerk user ID from JWT sub claim.
	UserIDKey AuthContextKey = "userID"
	// AuthTokenKey stores the raw bearer token.
	AuthTokenKey AuthContextKey = "authToken"
)

// ErrNoAuthHeader is returned when the Authorization header is missing.
var ErrNoAuthHeader = errors.New("authorization header is required")

type jwksVerifier struct {
	jwksURL    string
	httpClient *http.Client
	cacheTTL   time.Duration

	mu       sync.RWMutex
	expires  time.Time
	keyByKID map[string]*rsa.PublicKey
}

func newJWKSVerifier(jwksURL string) *jwksVerifier {
	return &jwksVerifier{
		jwksURL:    strings.TrimSpace(jwksURL),
		httpClient: &http.Client{Timeout: 5 * time.Second},
		cacheTTL:   10 * time.Minute,
		keyByKID:   map[string]*rsa.PublicKey{},
	}
}

// AuthMiddleware validates Clerk JWTs and injects user identity into context.
func AuthMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	verifier := newJWKSVerifier(cfg.ClerkJWKSURL)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authHeader == "" {
				http.Error(w, "Unauthorized: Missing auth credentials", http.StatusUnauthorized)
				return
			}

			tokenString, ok := bearerToken(authHeader)
			if !ok {
				http.Error(w, "Unauthorized: Invalid Authorization header format", http.StatusUnauthorized)
				return
			}

			userID, err := verifier.validateToken(
				r.Context(),
				tokenString,
				strings.TrimSpace(cfg.ClerkAudience),
				strings.TrimSpace(cfg.ClerkIssuer),
			)
			if err != nil {
				http.Error(w, "Unauthorized: Invalid token", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, AuthTokenKey, tokenString)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// InternalAuthMiddleware validates internal API calls via shared secret.
func InternalAuthMiddleware(requiredKey string) func(http.Handler) http.Handler {
	normalizedRequiredKey := strings.TrimSpace(requiredKey)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if normalizedRequiredKey == "" {
				http.Error(w, "Internal API key is not configured", http.StatusServiceUnavailable)
				return
			}

			provided := strings.TrimSpace(r.Header.Get("X-Internal-API-Key"))
			if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(normalizedRequiredKey)) != 1 {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func bearerToken(authHeader string) (string, bool) {
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", false
	}

	token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	if token == "" {
		return "", false
	}
	return token, true
}

func (v *jwksVerifier) validateToken(
	ctx context.Context,
	tokenString string,
	expectedAudience string,
	expectedIssuer string,
) (string, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"RS256"}), jwt.WithLeeway(30*time.Second))
	claims := jwt.MapClaims{}

	token, err := parser.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok || strings.TrimSpace(kid) == "" {
			return nil, errors.New("missing kid in token")
		}
		return v.getPublicKey(ctx, kid)
	})
	if err != nil || !token.Valid {
		return "", errors.New("token validation failed")
	}

	if expectedIssuer != "" {
		issuer, ok := claims["iss"].(string)
		if !ok || issuer != expectedIssuer {
			return "", errors.New("issuer mismatch")
		}
	}

	if expectedAudience != "" && !verifyAudienceClaim(claims["aud"], expectedAudience) {
		return "", errors.New("audience mismatch")
	}

	sub, ok := claims["sub"].(string)
	if !ok || strings.TrimSpace(sub) == "" {
		return "", errors.New("subject claim missing")
	}

	return sub, nil
}

func verifyAudienceClaim(audClaim any, expected string) bool {
	switch aud := audClaim.(type) {
	case string:
		return aud == expected
	case []any:
		for _, item := range aud {
			s, ok := item.(string)
			if ok && s == expected {
				return true
			}
		}
	case []string:
		for _, item := range aud {
			if item == expected {
				return true
			}
		}
	}
	return false
}

func (v *jwksVerifier) getPublicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if key := v.getCachedKey(kid); key != nil {
		return key, nil
	}

	if err := v.refreshKeys(ctx); err != nil {
		return nil, err
	}

	if key := v.getCachedKey(kid); key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("key not found for kid %s", kid)
}

func (v *jwksVerifier) getCachedKey(kid string) *rsa.PublicKey {
	now := time.Now()
	v.mu.RLock()
	defer v.mu.RUnlock()
	if now.After(v.expires) {
		return nil
	}
	return v.keyByKID[kid]
}

func (v *jwksVerifier) refreshKeys(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return err
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("jwks endpoint returned status %d", resp.StatusCode)
	}

	var payload struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return err
	}

	nextKeys := make(map[string]*rsa.PublicKey, len(payload.Keys))
	for _, key := range payload.Keys {
		if key.Kid == "" || key.Kty != "RSA" {
			continue
		}
		pub, err := parseRSAPublicKey(key.N, key.E)
		if err != nil {
			continue
		}
		nextKeys[key.Kid] = pub
	}

	if len(nextKeys) == 0 {
		return errors.New("no valid rsa keys in jwks")
	}

	v.mu.Lock()
	v.keyByKID = nextKeys
	v.expires = time.Now().Add(v.cacheTTL)
	v.mu.Unlock()
	return nil
}

func parseRSAPublicKey(modulus string, exponent string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(modulus)
	if err != nil {
		return nil, fmt.Errorf("decode modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(exponent)
	if err != nil {
		return nil, fmt.Errorf("decode exponent: %w", err)
	}

	var exp uint64
	for _, b := range eBytes {
		exp = (exp << 8) | uint64(b)
	}
	if exp == 0 {
		return nil, errors.New("invalid exponent")
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: int(exp),
	}, nil
}

// GetUserIDFromContext retrieves the user ID from request context.
func GetUserIDFromContext(ctx context.Context) string {
	userID, ok := ctx.Value(UserIDKey).(string)
	if !ok {
		return ""
	}
	return userID
}

// GetAuthTokenFromContext retrieves the auth token from request context.
func GetAuthTokenFromContext(ctx context.Context) string {
	token, ok := ctx.Value(AuthTokenKey).(string)
	if !ok {
		return ""
	}
	return token
}
