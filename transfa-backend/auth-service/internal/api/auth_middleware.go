package api

import (
	"context"
	"crypto/rsa"
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
)

type contextKey string

const clerkUserIDContextKey contextKey = "clerkUserID"

// AuthMiddlewareConfig controls how incoming requests are authenticated.
type AuthMiddlewareConfig struct {
	JWKSURL             string
	ExpectedAudience    string
	ExpectedIssuer      string
	AllowHeaderFallback bool
}

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

// ClerkAuthMiddleware validates Clerk JWTs and injects the Clerk user ID into context.
// For controlled local environments, header fallback can be enabled via config.
func ClerkAuthMiddleware(cfg AuthMiddlewareConfig) func(http.Handler) http.Handler {
	verifier := newJWKSVerifier(cfg.JWKSURL)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authHeader != "" {
				tokenString, ok := bearerToken(authHeader)
				if !ok {
					http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
					return
				}

				userID, err := verifier.validateToken(
					r.Context(),
					tokenString,
					strings.TrimSpace(cfg.ExpectedAudience),
					strings.TrimSpace(cfg.ExpectedIssuer),
				)
				if err != nil {
					http.Error(w, "Invalid token", http.StatusUnauthorized)
					return
				}

				ctx := context.WithValue(r.Context(), clerkUserIDContextKey, userID)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			if cfg.AllowHeaderFallback {
				if userID := strings.TrimSpace(r.Header.Get("X-Clerk-User-Id")); userID != "" {
					ctx := context.WithValue(r.Context(), clerkUserIDContextKey, userID)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			http.Error(w, "Authorization required", http.StatusUnauthorized)
		})
	}
}

// GetClerkUserID returns the authenticated Clerk user ID from request context.
func GetClerkUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(clerkUserIDContextKey).(string)
	return userID, ok
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

	if expectedAudience != "" {
		if !verifyAudienceClaim(claims["aud"], expectedAudience) {
			return "", errors.New("audience mismatch")
		}
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

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks endpoint returned %d", resp.StatusCode)
	}

	var payload struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Use string `json:"use"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return err
	}

	keys := map[string]*rsa.PublicKey{}
	for _, key := range payload.Keys {
		if key.Kid == "" || key.Kty != "RSA" || key.N == "" || key.E == "" {
			continue
		}
		pub, err := parseRSAPublicKey(key.N, key.E)
		if err != nil {
			continue
		}
		keys[key.Kid] = pub
	}
	if len(keys) == 0 {
		return errors.New("no usable RSA keys in JWKS")
	}

	v.mu.Lock()
	v.keyByKID = keys
	v.expires = time.Now().Add(v.cacheTTL)
	v.mu.Unlock()

	return nil
}

func parseRSAPublicKey(n, e string) (*rsa.PublicKey, error) {
	nb, err := base64.RawURLEncoding.DecodeString(n)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}
	eb, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}

	var exp uint64
	for _, b := range eb {
		exp = (exp << 8) | uint64(b)
	}
	if exp == 0 {
		return nil, errors.New("invalid exponent")
	}

	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nb),
		E: int(exp),
	}, nil
}
