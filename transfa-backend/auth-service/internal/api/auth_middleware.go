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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const clerkUserIDContextKey contextKey = "clerkUserID"
const clerkEmailContextKey contextKey = "clerkEmail"
const clerkSessionSecurityContextKey contextKey = "clerkSessionSecurity"

// ClerkSessionSecurity stores token-level session verification freshness metadata.
// Values are derived from Clerk JWT claims and can be used for step-up checks.
type ClerkSessionSecurity struct {
	FirstFactorAgeMinutes  *int64
	SecondFactorAgeMinutes *int64
}

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

				userID, tokenEmail, sessionSecurity, err := verifier.validateToken(
					r.Context(),
					tokenString,
					strings.TrimSpace(cfg.ExpectedAudience),
					strings.TrimSpace(cfg.ExpectedIssuer),
				)
				if err != nil {
					http.Error(w, "Invalid token", http.StatusUnauthorized)
					return
				}

				headerEmail := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Email")))
				if tokenEmail != "" && headerEmail != "" && tokenEmail != headerEmail {
					http.Error(w, "Invalid user email context", http.StatusUnauthorized)
					return
				}

				email := tokenEmail
				if email == "" {
					email = headerEmail
				}

				ctx := context.WithValue(r.Context(), clerkUserIDContextKey, userID)
				if email != "" {
					ctx = context.WithValue(ctx, clerkEmailContextKey, email)
				}
				if sessionSecurity != nil {
					ctx = context.WithValue(ctx, clerkSessionSecurityContextKey, sessionSecurity)
				}
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			if cfg.AllowHeaderFallback {
				if userID := strings.TrimSpace(r.Header.Get("X-Clerk-User-Id")); userID != "" {
					ctx := context.WithValue(r.Context(), clerkUserIDContextKey, userID)
					if email := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Email"))); email != "" {
						ctx = context.WithValue(ctx, clerkEmailContextKey, email)
					}
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

// GetClerkUserEmail returns the authenticated email from request context when available.
func GetClerkUserEmail(ctx context.Context) (string, bool) {
	email, ok := ctx.Value(clerkEmailContextKey).(string)
	return email, ok
}

// GetClerkSessionSecurity returns Clerk verification freshness metadata from context.
func GetClerkSessionSecurity(ctx context.Context) (*ClerkSessionSecurity, bool) {
	security, ok := ctx.Value(clerkSessionSecurityContextKey).(*ClerkSessionSecurity)
	return security, ok
}

// WithClerkSessionSecurity stores Clerk verification freshness metadata in context.
func WithClerkSessionSecurity(ctx context.Context, security *ClerkSessionSecurity) context.Context {
	return context.WithValue(ctx, clerkSessionSecurityContextKey, security)
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
) (string, string, *ClerkSessionSecurity, error) {
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
		return "", "", nil, errors.New("token validation failed")
	}

	if expectedIssuer != "" {
		issuer, ok := claims["iss"].(string)
		if !ok || issuer != expectedIssuer {
			return "", "", nil, errors.New("issuer mismatch")
		}
	}

	if expectedAudience != "" {
		if !verifyAudienceClaim(claims["aud"], expectedAudience) {
			return "", "", nil, errors.New("audience mismatch")
		}
	}

	sub, ok := claims["sub"].(string)
	if !ok || strings.TrimSpace(sub) == "" {
		return "", "", nil, errors.New("subject claim missing")
	}

	return sub, extractEmailClaim(claims), extractSessionSecurity(claims), nil
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

func extractEmailClaim(claims jwt.MapClaims) string {
	candidates := []string{"email", "email_address", "primary_email_address"}
	for _, key := range candidates {
		if value, ok := claims[key].(string); ok {
			trimmed := strings.ToLower(strings.TrimSpace(value))
			if trimmed != "" {
				return trimmed
			}
		}
	}

	if nested, ok := claims["https://clerk.dev/claims"].(map[string]any); ok {
		for _, key := range candidates {
			if value, ok := nested[key].(string); ok {
				trimmed := strings.ToLower(strings.TrimSpace(value))
				if trimmed != "" {
					return trimmed
				}
			}
		}
	}

	return ""
}

func extractSessionSecurity(claims jwt.MapClaims) *ClerkSessionSecurity {
	security := &ClerkSessionSecurity{}

	fvaClaim, hasFVA := claims["fva"]
	if !hasFVA {
		if nested, ok := claims["https://clerk.dev/claims"].(map[string]any); ok {
			if nestedFVA, ok := nested["fva"]; ok {
				fvaClaim = nestedFVA
				hasFVA = true
			}
		}
	}
	if hasFVA {
		if firstAge, secondAge, parsed := parseFVAClaim(fvaClaim); parsed {
			security.FirstFactorAgeMinutes = firstAge
			security.SecondFactorAgeMinutes = secondAge
		}
	}

	if security.FirstFactorAgeMinutes == nil && security.SecondFactorAgeMinutes == nil {
		return nil
	}

	return security
}

func parseInt64Claim(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int32:
		return int64(typed), true
	case int64:
		return typed, true
	case float32:
		return int64(typed), true
	case float64:
		return int64(typed), true
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil {
			return 0, false
		}
		return parsed, true
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return 0, false
		}
		parsed, err := strconv.ParseInt(trimmed, 10, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func parseFVAClaim(value any) (*int64, *int64, bool) {
	list, ok := value.([]any)
	if !ok || len(list) == 0 {
		return nil, nil, false
	}

	var firstFactorAge *int64
	var secondFactorAge *int64

	if len(list) >= 1 {
		if parsed, ok := parseInt64Claim(list[0]); ok {
			firstFactorAge = &parsed
		}
	}
	if len(list) >= 2 {
		if parsed, ok := parseInt64Claim(list[1]); ok {
			secondFactorAge = &parsed
		}
	}

	if firstFactorAge == nil && secondFactorAge == nil {
		return nil, nil, false
	}

	return firstFactorAge, secondFactorAge, true
}
