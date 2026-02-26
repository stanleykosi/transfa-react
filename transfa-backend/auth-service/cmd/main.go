package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/transfa/auth-service/internal/api"
	authapp "github.com/transfa/auth-service/internal/app"
	"github.com/transfa/auth-service/internal/config"
	"github.com/transfa/auth-service/internal/domain"
	"github.com/transfa/auth-service/internal/store"
	"golang.org/x/crypto/bcrypt"
)

type onboardingState struct {
	Status     string                 `json:"status"`
	Reason     *string                `json:"reason,omitempty"`
	NextStep   string                 `json:"next_step"`
	ResumeStep *int                   `json:"resume_step,omitempty"`
	UserType   *string                `json:"user_type,omitempty"`
	Draft      map[string]interface{} `json:"draft,omitempty"`
}

type accountTypeOption struct {
	Type        string `json:"type"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type authSessionResponse struct {
	Authenticated bool            `json:"authenticated"`
	ClerkUserID   string          `json:"clerk_user_id"`
	User          *domain.User    `json:"user,omitempty"`
	Onboarding    onboardingState `json:"onboarding"`
}

type userDiscoveryResult struct {
	ID       string  `json:"id"`
	Username string  `json:"username"`
	FullName *string `json:"full_name,omitempty"`
}

var (
	usernamePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])?$`)
	pinPattern      = regexp.MustCompile(`^[0-9]{4}$`)
)

func maskAMQPURLForLog(raw string) string {
	trimmed := strings.TrimSpace(raw)
	u, err := url.Parse(trimmed)
	if err != nil {
		return "<unparseable>"
	}
	if u.User != nil {
		u.User = url.UserPassword("****", "****")
	}
	return u.String()
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("cannot load config: %v", err)
	}

	if port := os.Getenv("PORT"); port != "" {
		cfg.ServerPort = port
	}
	if cfg.ServerPort == "" {
		cfg.ServerPort = "8080"
	}

	if strings.TrimSpace(cfg.ClerkJWKSURL) == "" && !cfg.AllowInsecureHeaderAuth {
		log.Fatal("CLERK_JWKS_URL is required when ALLOW_INSECURE_HEADER_AUTH is false")
	}

	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Unable to parse database URL: %v", err)
	}
	dbConfig.MaxConns = 10
	dbConfig.MinConns = 2
	dbConfig.MaxConnLifetime = 30 * time.Minute
	dbConfig.MaxConnIdleTime = 5 * time.Minute
	dbConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	dbpool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established")

	log.Printf("RABBITMQ_URL (masked)=%s", maskAMQPURLForLog(cfg.RabbitMQURL))

	userRepo := store.NewPostgresUserRepository(dbpool)

	if err := verifyRequiredSchema(context.Background(), dbpool); err != nil {
		log.Fatalf("database schema validation failed: %v", err)
	}

	if strings.TrimSpace(cfg.RabbitMQURL) == "" {
		log.Println("WARNING: RABBITMQ_URL is empty, outbox dispatcher is disabled.")
	} else {
		outboxCtx, cancelOutbox := context.WithCancel(context.Background())
		defer cancelOutbox()
		dispatcher := authapp.NewOutboxDispatcher(userRepo, cfg.RabbitMQURL)
		go dispatcher.Run(outboxCtx)
		log.Println("Outbox dispatcher started")
	}

	pinChangeReverificationMaxAgeSeconds := parseEnvPositiveInt("PIN_CHANGE_REVERIFICATION_MAX_AGE_SECONDS", 600, 3600)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(securityHeadersMiddleware)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: parseAllowedOrigins(cfg.AllowedOrigins),
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-Clerk-User-Id",
			"X-User-Email",
			"X-Request-ID",
		},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	onboardingHandler := api.NewOnboardingHandler(userRepo)
	authMiddleware := api.ClerkAuthMiddleware(api.AuthMiddlewareConfig{
		JWKSURL:             cfg.ClerkJWKSURL,
		ExpectedAudience:    cfg.ClerkAudience,
		ExpectedIssuer:      cfg.ClerkIssuer,
		AllowHeaderFallback: cfg.AllowInsecureHeaderAuth,
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
	})

	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)
		r.Use(middleware.ThrottleBacklog(200, 200, 5*time.Second))

		r.Get("/onboarding/account-types", func(w http.ResponseWriter, r *http.Request) {
			if _, ok := api.GetClerkUserID(r.Context()); !ok {
				writeError(w, http.StatusUnauthorized, errors.New("unauthorized"))
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"options": []accountTypeOption{
					{Type: "personal", Title: "Individual", Description: "For Individual use"},
					{Type: "merchant", Title: "Merchant", Description: "For Business owners"},
				},
			})
		})

		r.Post("/onboarding", onboardingHandler.ServeHTTP)
		r.Post("/onboarding/tier1/update", onboardingHandler.HandleTier1Update)
		r.Post("/onboarding/tier2", onboardingHandler.HandleTier2)
		r.Post("/onboarding/tier3", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			if existing.AnchorCustomerID == nil || strings.TrimSpace(*existing.AnchorCustomerID) == "" {
				writeError(w, http.StatusPreconditionFailed, errors.New("tier 1 verification incomplete"))
				return
			}
			tier2Ready, err := canStartTier3Upgrade(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			if !tier2Ready {
				writeError(w, http.StatusPreconditionFailed, errors.New("tier 2 verification incomplete"))
				return
			}

			tier3Status, _, err := getOnboardingStageStatus(r.Context(), dbpool, existing.ID, "tier3")
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			normalizedTier3Status := strings.ToLower(strings.TrimSpace(tier3Status))
			switch normalizedTier3Status {
			case "pending", "processing", "manual_review", "awaiting_document":
				writeJSON(w, http.StatusAccepted, map[string]string{"status": "tier3_processing"})
				return
			case "completed", "approved":
				writeJSON(w, http.StatusOK, map[string]string{"status": "tier3_completed"})
				return
			}

			var body struct {
				IDType     string `json:"id_type"`
				IDNumber   string `json:"id_number"`
				ExpiryDate string `json:"expiry_date"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
				return
			}

			idType := strings.ToUpper(strings.TrimSpace(body.IDType))
			idNumber := strings.TrimSpace(body.IDNumber)
			expiryDate := strings.TrimSpace(body.ExpiryDate)

			if idType == "" || idNumber == "" || expiryDate == "" {
				writeError(w, http.StatusBadRequest, errors.New("id_type, id_number and expiry_date are required"))
				return
			}
			if !isSupportedTier3IDType(idType) {
				writeError(w, http.StatusBadRequest, errors.New("unsupported id_type"))
				return
			}
			if len(idNumber) < 4 || len(idNumber) > 64 {
				writeError(w, http.StatusBadRequest, errors.New("id_number must be between 4 and 64 characters"))
				return
			}

			normalizedExpiryDate, err := normalizeISODate(expiryDate)
			if err != nil {
				writeError(w, http.StatusBadRequest, err)
				return
			}
			expiry, parseErr := time.Parse("2006-01-02", normalizedExpiryDate)
			if parseErr != nil {
				writeError(w, http.StatusBadRequest, errors.New("expiry_date must be in YYYY-MM-DD format"))
				return
			}
			today := time.Now().UTC().Truncate(24 * time.Hour)
			if expiry.Before(today) {
				writeError(w, http.StatusBadRequest, errors.New("expiry_date cannot be in the past"))
				return
			}

			event := domain.Tier3VerificationRequestedEvent{
				UserID:           existing.ID,
				AnchorCustomerID: strings.TrimSpace(*existing.AnchorCustomerID),
				IDType:           idType,
				IDNumber:         idNumber,
				ExpiryDate:       normalizedExpiryDate,
			}

			if err := userRepo.UpsertOnboardingStatusAndEnqueueEvent(
				r.Context(),
				existing.ID,
				"tier3",
				"pending",
				nil,
				"customer_events",
				"tier3.verification.requested",
				event,
			); err != nil {
				writeError(w, http.StatusInternalServerError, errors.New("failed to queue tier3 verification"))
				return
			}

			writeJSON(w, http.StatusAccepted, map[string]string{"status": "tier3_processing"})
		})
		r.Post("/onboarding/progress", onboardingHandler.HandleSaveProgress)
		r.Post("/onboarding/progress/clear", onboardingHandler.HandleClearProgress)

		r.Get("/onboarding/status", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				if statusCode == http.StatusNotFound {
					if clerkUserID, ok := api.GetClerkUserID(r.Context()); ok {
						progress, progressErr := userRepo.GetOnboardingProgressByClerkUserID(r.Context(), clerkUserID)
						if progressErr != nil {
							writeError(w, http.StatusInternalServerError, progressErr)
							return
						}
						if progress != nil {
							writeJSON(w, http.StatusOK, buildOnboardingState("new", nil, progress, false, true, false))
							return
						}
					}
				}
				writeError(w, statusCode, err)
				return
			}

			status, reason, hasAccount, hasTransactionPIN, err := deriveOnboardingStatus(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			progress, err := userRepo.GetOnboardingProgressByClerkUserID(r.Context(), existing.ClerkUserID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			usernameMissing := existing.Username == nil || strings.TrimSpace(*existing.Username) == ""
			writeJSON(w, http.StatusOK, buildOnboardingState(status, reason, progress, hasAccount, usernameMissing, hasTransactionPIN))
		})

		r.Get("/me/profile", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}
			writeJSON(w, http.StatusOK, existing)
		})

		r.Get("/me/security-status", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			hasTransactionPIN, err := userHasTransactionPIN(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]bool{
				"transaction_pin_set": hasTransactionPIN,
			})
		})

		r.Get("/me/kyc-status", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			stageStatus := map[string]map[string]any{
				"tier1": {"status": "pending"},
				"tier2": {"status": "pending"},
				"tier3": {"status": "pending"},
			}

			rows, err := dbpool.Query(
				r.Context(),
				`SELECT stage, status, reason, updated_at
				   FROM onboarding_status
				  WHERE user_id = $1
				    AND stage IN ('tier1', 'tier2', 'tier3')`,
				existing.ID,
			)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			defer rows.Close()
			hasTier2Record := false

			for rows.Next() {
				var (
					stage     string
					status    string
					reason    *string
					updatedAt time.Time
				)
				if err := rows.Scan(&stage, &status, &reason, &updatedAt); err != nil {
					writeError(w, http.StatusInternalServerError, err)
					return
				}

				entry := map[string]any{
					"status":     strings.ToLower(strings.TrimSpace(status)),
					"updated_at": updatedAt.UTC().Format(time.RFC3339),
				}
				if reason != nil && strings.TrimSpace(*reason) != "" {
					entry["reason"] = *reason
				}
				stageStatus[stage] = entry
				if stage == "tier2" {
					hasTier2Record = true
				}
			}
			if err := rows.Err(); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			hasAccount := false
			if !hasTier2Record {
				// Legacy fallback: historically an account could imply tier2 completion.
				hasAccount, err = userHasAccount(r.Context(), dbpool, existing.ID)
				if err != nil {
					writeError(w, http.StatusInternalServerError, err)
					return
				}
			}
			currentTier := determineCurrentKYCTier(stageStatus, hasTier2Record, hasAccount)

			writeJSON(w, http.StatusOK, map[string]any{
				"current_tier": currentTier,
				"stages":       stageStatus,
			})
		})

		r.Get("/users/search", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			query := strings.TrimSpace(r.URL.Query().Get("q"))
			if query == "" {
				writeJSON(w, http.StatusOK, map[string]any{"users": []userDiscoveryResult{}})
				return
			}
			if len(query) > 64 {
				writeError(w, http.StatusBadRequest, errors.New("query must be 64 characters or less"))
				return
			}

			limit := parsePositiveBoundedInt(r.URL.Query().Get("limit"), 10, 20)
			users, err := searchUsersByQuery(r.Context(), dbpool, existing.ID, query, limit)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{"users": users})
		})

		r.Get("/users/frequent", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			limit := parsePositiveBoundedInt(r.URL.Query().Get("limit"), 6, 12)
			users, err := listFrequentUsers(r.Context(), dbpool, existing.ID, limit)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{"users": users})
		})

		r.Post("/me/username", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			var body struct {
				Username string `json:"username"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
				return
			}

			username, err := normalizeAndValidateUsername(body.Username)
			if err != nil {
				writeError(w, http.StatusBadRequest, err)
				return
			}

			hasAccount, err := userHasAccount(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			if !hasAccount {
				writeError(w, http.StatusPreconditionFailed, errors.New("account provisioning is still in progress"))
				return
			}

			_, err = dbpool.Exec(
				r.Context(),
				`UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2`,
				username,
				existing.ID,
			)
			if err != nil {
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23505" {
					writeError(w, http.StatusConflict, errors.New("username is not available"))
					return
				}
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]any{
				"status":   "username_set",
				"username": username,
			})
		})

		r.Post("/me/transaction-pin", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			var body struct {
				Pin string `json:"pin"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
				return
			}

			pin := strings.TrimSpace(body.Pin)
			if err := validateTransactionPIN(pin); err != nil {
				writeError(w, http.StatusBadRequest, err)
				return
			}

			hasAccount, err := userHasAccount(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			if !hasAccount {
				writeError(w, http.StatusPreconditionFailed, errors.New("account provisioning is still in progress"))
				return
			}

			if existing.Username == nil || strings.TrimSpace(*existing.Username) == "" {
				writeError(w, http.StatusPreconditionFailed, errors.New("username must be set before transaction pin"))
				return
			}

			hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			_, err = dbpool.Exec(
				r.Context(),
				`INSERT INTO user_security_credentials (user_id, transaction_pin_hash, pin_set_at)
				 VALUES ($1, $2, NOW())
				 ON CONFLICT (user_id)
				 DO UPDATE SET
				   transaction_pin_hash = EXCLUDED.transaction_pin_hash,
				   pin_set_at = NOW(),
				   updated_at = NOW()`,
				existing.ID,
				string(hash),
			)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]string{"status": "transaction_pin_set"})
		})

		r.Post("/me/pin-change/complete", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			var body struct {
				CurrentPin string `json:"current_pin"`
				NewPin     string `json:"new_pin"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
				return
			}

			currentPin := strings.TrimSpace(body.CurrentPin)
			newPin := strings.TrimSpace(body.NewPin)
			if currentPin == "" || newPin == "" {
				writeError(w, http.StatusBadRequest, errors.New("current_pin and new_pin are required"))
				return
			}
			if !pinPattern.MatchString(currentPin) {
				writeError(w, http.StatusBadRequest, errors.New("current_pin must be exactly 4 digits"))
				return
			}
			if err := validateTransactionPIN(newPin); err != nil {
				writeError(w, http.StatusBadRequest, err)
				return
			}
			if err := requireFreshPinChangeReverification(
				r.Context(),
				pinChangeReverificationMaxAgeSeconds,
				cfg.AllowInsecureHeaderAuth,
			); err != nil {
				writeError(w, http.StatusPreconditionFailed, err)
				return
			}

			tx, err := dbpool.Begin(r.Context())
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			defer tx.Rollback(r.Context())

			now := time.Now().UTC()

			var (
				storedHash     string
				failedAttempts int
				lockedUntil    *time.Time
			)
			if err := tx.QueryRow(
				r.Context(),
				`SELECT transaction_pin_hash, failed_attempts, locked_until
				   FROM user_security_credentials
				  WHERE user_id = $1
				  FOR UPDATE`,
				existing.ID,
			).Scan(&storedHash, &failedAttempts, &lockedUntil); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					writeError(w, http.StatusPreconditionFailed, errors.New("transaction pin is not set"))
					return
				}
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			if lockedUntil != nil && lockedUntil.After(now) {
				writeError(w, http.StatusLocked, errors.New("transaction pin is temporarily locked"))
				return
			}

			if bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(currentPin)) != nil {
				if err := recordFailedTransactionPINAttemptTx(r.Context(), tx, existing.ID, now); err != nil {
					writeError(w, http.StatusInternalServerError, err)
					return
				}
				if err := tx.Commit(r.Context()); err != nil {
					writeError(w, http.StatusInternalServerError, err)
					return
				}
				writeError(w, http.StatusUnauthorized, errors.New("current pin is invalid"))
				return
			}

			if bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(newPin)) == nil {
				writeError(w, http.StatusBadRequest, errors.New("new pin must be different from current pin"))
				return
			}

			newHash, err := bcrypt.GenerateFromPassword([]byte(newPin), bcrypt.DefaultCost)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			if _, err := tx.Exec(
				r.Context(),
				`UPDATE user_security_credentials
				    SET transaction_pin_hash = $2,
				        pin_set_at = NOW(),
				        failed_attempts = 0,
				        last_failed_at = NULL,
				        locked_until = NULL,
				        updated_at = NOW()
				  WHERE user_id = $1`,
				existing.ID,
				string(newHash),
			); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			if err := tx.Commit(r.Context()); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, map[string]string{"status": "transaction_pin_changed"})
		})

		r.Get("/me/primary-account", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			accountNumber, bankName, err := getPrimaryAccount(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			if accountNumber == nil {
				writeJSON(w, http.StatusOK, map[string]any{})
				return
			}

			response := map[string]any{"accountNumber": *accountNumber}
			if bankName != nil && strings.TrimSpace(*bankName) != "" {
				response["bankName"] = *bankName
			}
			writeJSON(w, http.StatusOK, response)
		})

		r.Get("/auth/session", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				if statusCode == http.StatusNotFound {
					clerkUserID, ok := api.GetClerkUserID(r.Context())
					if ok {
						progress, progressErr := userRepo.GetOnboardingProgressByClerkUserID(r.Context(), clerkUserID)
						if progressErr != nil {
							writeError(w, http.StatusInternalServerError, progressErr)
							return
						}
						if progress != nil {
							writeJSON(w, http.StatusOK, authSessionResponse{
								Authenticated: true,
								ClerkUserID:   clerkUserID,
								Onboarding:    buildOnboardingState("new", nil, progress, false, true, false),
							})
							return
						}
					}
				}
				writeError(w, statusCode, err)
				return
			}

			status, reason, hasAccount, hasTransactionPIN, err := deriveOnboardingStatus(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			progress, err := userRepo.GetOnboardingProgressByClerkUserID(r.Context(), existing.ClerkUserID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			clerkUserID, _ := api.GetClerkUserID(r.Context())
			usernameMissing := existing.Username == nil || strings.TrimSpace(*existing.Username) == ""
			writeJSON(w, http.StatusOK, authSessionResponse{
				Authenticated: true,
				ClerkUserID:   clerkUserID,
				User:          existing,
				Onboarding:    buildOnboardingState(status, reason, progress, hasAccount, usernameMissing, hasTransactionPIN),
			})
		})
	})

	server := &http.Server{
		Addr:              ":" + cfg.ServerPort,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("Server starting on port %s", cfg.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Could not start server: %s", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}

	log.Println("Server gracefully stopped")
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		next.ServeHTTP(w, r)
	})
}

func parseAllowedOrigins(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []string{"http://localhost:3000", "http://localhost:19006", "http://localhost:8081"}
	}

	parts := strings.Split(trimmed, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			origins = append(origins, value)
		}
	}

	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
}

func resolveAuthenticatedUser(r *http.Request, userRepo store.UserRepository) (*domain.User, int, error) {
	clerkUserID, ok := api.GetClerkUserID(r.Context())
	if !ok || strings.TrimSpace(clerkUserID) == "" {
		return nil, http.StatusUnauthorized, errors.New("unauthorized")
	}

	existing, err := userRepo.FindByClerkUserID(r.Context(), clerkUserID)
	if err == nil && existing != nil {
		return existing, http.StatusOK, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, http.StatusInternalServerError, err
	}

	email := ""
	if contextEmail, ok := api.GetClerkUserEmail(r.Context()); ok {
		email = strings.TrimSpace(contextEmail)
	}
	if email == "" {
		email = strings.TrimSpace(r.Header.Get("X-User-Email"))
	}
	if email == "" {
		return nil, http.StatusNotFound, errors.New("user not found")
	}

	byEmail, emailErr := userRepo.FindByEmail(r.Context(), email)
	if emailErr != nil {
		if errors.Is(emailErr, pgx.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("user not found")
		}
		return nil, http.StatusInternalServerError, emailErr
	}

	if byEmail != nil && byEmail.ClerkUserID != clerkUserID {
		if updateErr := userRepo.UpdateClerkUserID(r.Context(), byEmail.ID, clerkUserID); updateErr != nil {
			log.Printf("WARN: Failed updating clerk_user_id for user %s: %v", byEmail.ID, updateErr)
		} else {
			byEmail.ClerkUserID = clerkUserID
		}
	}

	return byEmail, http.StatusOK, nil
}

func parsePositiveBoundedInt(raw string, fallback int, max int) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	if parsed > max {
		return max
	}
	return parsed
}

func searchUsersByQuery(ctx context.Context, dbpool *pgxpool.Pool, requesterID string, query string, limit int) ([]userDiscoveryResult, error) {
	rows, err := dbpool.Query(
		ctx,
		`SELECT id, btrim(username) AS username, full_name
		   FROM users
		  WHERE id <> $1
		    AND username IS NOT NULL
		    AND btrim(username) <> ''
		    AND (
		      btrim(username) ILIKE '%' || $2 || '%'
		      OR COALESCE(full_name, '') ILIKE '%' || $2 || '%'
		    )
		  ORDER BY
		    CASE
		      WHEN lower(btrim(username)) = lower($2) THEN 0
		      WHEN lower(btrim(username)) LIKE lower($2) || '%' THEN 1
		      WHEN lower(COALESCE(full_name, '')) LIKE lower($2) || '%' THEN 2
		      ELSE 3
		    END,
		    btrim(username) ASC
		  LIMIT $3`,
		requesterID,
		query,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]userDiscoveryResult, 0, limit)
	for rows.Next() {
		var item userDiscoveryResult
		if err := rows.Scan(&item.ID, &item.Username, &item.FullName); err != nil {
			return nil, err
		}
		results = append(results, item)
	}

	return results, rows.Err()
}

func listFrequentUsers(ctx context.Context, dbpool *pgxpool.Pool, requesterID string, limit int) ([]userDiscoveryResult, error) {
	rows, err := dbpool.Query(
		ctx,
		`SELECT u.id, btrim(u.username) AS username, u.full_name
		   FROM transactions t
		   JOIN users u ON u.id = t.recipient_id
		  WHERE t.sender_id = $1
		    AND t.type = 'p2p'
		    AND t.status = 'completed'
		    AND u.username IS NOT NULL
		    AND btrim(u.username) <> ''
		  GROUP BY u.id, btrim(u.username), u.full_name
		  ORDER BY COUNT(*) DESC, MAX(t.created_at) DESC
		  LIMIT $2`,
		requesterID,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]userDiscoveryResult, 0, limit)
	seen := make(map[string]struct{}, limit)
	for rows.Next() {
		var item userDiscoveryResult
		if err := rows.Scan(&item.ID, &item.Username, &item.FullName); err != nil {
			return nil, err
		}
		seen[item.ID] = struct{}{}
		results = append(results, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(results) >= limit {
		return results, nil
	}

	remaining := limit - len(results)
	fallbackRows, err := dbpool.Query(
		ctx,
		`SELECT id, btrim(username) AS username, full_name
		   FROM users
		  WHERE id <> $1
		    AND username IS NOT NULL
		    AND btrim(username) <> ''
		  ORDER BY updated_at DESC
		  LIMIT $2`,
		requesterID,
		remaining*2,
	)
	if err != nil {
		return nil, err
	}
	defer fallbackRows.Close()

	for fallbackRows.Next() {
		if len(results) >= limit {
			break
		}

		var item userDiscoveryResult
		if err := fallbackRows.Scan(&item.ID, &item.Username, &item.FullName); err != nil {
			return nil, err
		}
		if _, exists := seen[item.ID]; exists {
			continue
		}
		seen[item.ID] = struct{}{}
		results = append(results, item)
	}

	return results, fallbackRows.Err()
}

func deriveOnboardingStatus(
	ctx context.Context,
	dbpool *pgxpool.Pool,
	userID string,
) (string, *string, bool, bool, error) {
	hasAccount, err := userHasAccount(ctx, dbpool, userID)
	if err != nil {
		return "", nil, false, false, err
	}

	hasTransactionPIN, err := userHasTransactionPIN(ctx, dbpool, userID)
	if err != nil {
		return "", nil, hasAccount, false, err
	}

	if hasAccount {
		return "completed", nil, hasAccount, hasTransactionPIN, nil
	}

	var (
		tier1Status    string
		tier1Reason    *string
		tier1UpdatedAt time.Time
		hasTier1       bool
	)
	if err := dbpool.QueryRow(
		ctx,
		`SELECT status, reason, updated_at FROM onboarding_status WHERE user_id = $1 AND stage = 'tier1'`,
		userID,
	).Scan(&tier1Status, &tier1Reason, &tier1UpdatedAt); err == nil {
		hasTier1 = true
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, hasAccount, hasTransactionPIN, err
	}

	var (
		tier2Status    string
		tier2Reason    *string
		tier2UpdatedAt time.Time
		hasTier2       bool
	)
	if err := dbpool.QueryRow(
		ctx,
		`SELECT status, reason, updated_at FROM onboarding_status WHERE user_id = $1 AND stage = 'tier2'`,
		userID,
	).Scan(&tier2Status, &tier2Reason, &tier2UpdatedAt); err == nil {
		hasTier2 = true
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, hasAccount, hasTransactionPIN, err
	}

	// Tier1 "in-progress/failure" states take precedence to support correction flows,
	// even when a stale Tier2 failure row exists.
	if hasTier1 {
		t1 := strings.ToLower(strings.TrimSpace(tier1Status))
		switch t1 {
		case "pending", "processing":
			return "tier1_pending", tier1Reason, hasAccount, hasTransactionPIN, nil
		case "failed":
			return "tier1_failed", tier1Reason, hasAccount, hasTransactionPIN, nil
		case "rate_limited", "system_error":
			return "tier1_" + t1, tier1Reason, hasAccount, hasTransactionPIN, nil
		}
	}

	// If tier1 was re-created after an earlier tier2 attempt, treat older tier2
	// statuses as stale and let the client continue from tier1_created.
	if hasTier1 {
		t1 := strings.ToLower(strings.TrimSpace(tier1Status))
		if t1 == "created" && (!hasTier2 || tier1UpdatedAt.After(tier2UpdatedAt)) {
			return "tier1_created", tier1Reason, hasAccount, hasTransactionPIN, nil
		}
	}

	if hasTier2 {
		t2 := strings.ToLower(strings.TrimSpace(tier2Status))
		if t2 == "failed" || t2 == "error" {
			return "tier2_failed", tier2Reason, hasAccount, hasTransactionPIN, nil
		}
		if t2 == "completed" {
			return "tier2_completed", tier2Reason, hasAccount, hasTransactionPIN, nil
		}
		if t2 != "" {
			return "tier2_" + t2, tier2Reason, hasAccount, hasTransactionPIN, nil
		}
	}

	if hasTier1 {
		t1 := strings.ToLower(strings.TrimSpace(tier1Status))
		if t1 == "created" {
			return "tier1_created", tier1Reason, hasAccount, hasTransactionPIN, nil
		}
		if t1 != "" {
			return "tier1_" + t1, tier1Reason, hasAccount, hasTransactionPIN, nil
		}
	}

	return "new", nil, hasAccount, hasTransactionPIN, nil
}

func mapNextStep(status string, hasAccount bool, usernameMissing bool, hasTransactionPIN bool) string {
	if hasAccount {
		if usernameMissing {
			return "create_username"
		}
		if !hasTransactionPIN {
			return "create_pin"
		}
		return "app_tabs"
	}

	switch status {
	case "completed":
		return "app_tabs"
	default:
		if strings.HasPrefix(status, "tier2_") {
			return "create_account"
		}
		return "onboarding_form"
	}
}

func buildOnboardingState(
	status string,
	reason *string,
	progress *store.OnboardingProgress,
	hasAccount bool,
	usernameMissing bool,
	hasTransactionPIN bool,
) onboardingState {
	state := onboardingState{
		Status:   status,
		Reason:   reason,
		NextStep: mapNextStep(status, hasAccount, usernameMissing, hasTransactionPIN),
	}

	if progress != nil {
		if progress.CurrentStep >= 1 && progress.CurrentStep <= 3 {
			step := progress.CurrentStep
			state.ResumeStep = &step
		}
		if strings.TrimSpace(progress.UserType) != "" {
			userType := strings.ToLower(strings.TrimSpace(progress.UserType))
			state.UserType = &userType
		}
		if len(progress.Payload) > 0 {
			state.Draft = progress.Payload
		}
		return state
	}

	// Fallback inference when no draft exists but onboarding is already in-flight.
	switch {
	case strings.HasPrefix(status, "tier1_"), strings.HasPrefix(status, "tier2_"):
		step := 3
		state.ResumeStep = &step
	}

	return state
}

func userHasAccount(ctx context.Context, dbpool *pgxpool.Pool, userID string) (bool, error) {
	var accountCount int
	if err := dbpool.QueryRow(ctx, `SELECT COUNT(1) FROM accounts WHERE user_id = $1`, userID).Scan(&accountCount); err != nil {
		return false, err
	}
	return accountCount > 0, nil
}

func userHasTransactionPIN(ctx context.Context, dbpool *pgxpool.Pool, userID string) (bool, error) {
	var exists bool
	if err := dbpool.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM user_security_credentials
			WHERE user_id = $1
			  AND transaction_pin_hash IS NOT NULL
			  AND transaction_pin_hash <> ''
		)`,
		userID,
	).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return exists, nil
}

func normalizeAndValidateUsername(raw string) (string, error) {
	username := strings.ToLower(strings.TrimSpace(raw))
	if username == "" {
		return "", errors.New("username is required")
	}
	if !usernamePattern.MatchString(username) {
		return "", errors.New("username must be 3-20 characters and contain only lowercase letters, numbers, dot, or underscore")
	}
	switch username {
	case "admin", "support", "root", "transfa":
		return "", errors.New("username is not available")
	}
	return username, nil
}

func validateTransactionPIN(pin string) error {
	if !pinPattern.MatchString(pin) {
		return errors.New("transaction pin must be exactly 4 digits")
	}

	blocked := map[string]struct{}{
		"0000": {}, "1111": {}, "2222": {}, "3333": {}, "4444": {},
		"5555": {}, "6666": {}, "7777": {}, "8888": {}, "9999": {},
		"1234": {}, "4321": {}, "1212": {}, "1122": {}, "1000": {},
	}
	if _, found := blocked[pin]; found {
		return errors.New("choose a less predictable transaction pin")
	}
	return nil
}

func getPrimaryAccount(ctx context.Context, dbpool *pgxpool.Pool, userID string) (*string, *string, error) {
	var accountNumber *string
	var bankName *string
	err := dbpool.QueryRow(
		ctx,
		`SELECT virtual_nuban, bank_name FROM accounts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&accountNumber, &bankName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	return accountNumber, bankName, nil
}

func requireFreshPinChangeReverification(
	ctx context.Context,
	maxAgeSeconds int,
	allowInsecureHeaderFallback bool,
) error {
	if maxAgeSeconds <= 0 {
		maxAgeSeconds = 600
	}

	security, ok := api.GetClerkSessionSecurity(ctx)
	if !ok || security == nil {
		if allowInsecureHeaderFallback {
			return nil
		}
		return errors.New("recent reverification is required to change transaction pin")
	}

	maxAgeDuration := time.Duration(maxAgeSeconds) * time.Second

	if security.FirstFactorAgeMinutes != nil {
		ageMinutes := *security.FirstFactorAgeMinutes
		if ageMinutes >= 0 && time.Duration(ageMinutes)*time.Minute <= maxAgeDuration {
			return nil
		}
	}

	if security.SecondFactorAgeMinutes != nil {
		ageMinutes := *security.SecondFactorAgeMinutes
		if ageMinutes >= 0 && time.Duration(ageMinutes)*time.Minute <= maxAgeDuration {
			return nil
		}
	}

	return errors.New("recent reverification is required to change transaction pin")
}

func determineCurrentKYCTier(
	stageStatus map[string]map[string]any,
	hasTier2Record bool,
	hasAccount bool,
) int {
	tier3Status := strings.ToLower(strings.TrimSpace(toString(stageStatus["tier3"]["status"])))
	if tier3Status == "completed" || tier3Status == "approved" {
		return 3
	}

	tier2Status := strings.ToLower(strings.TrimSpace(toString(stageStatus["tier2"]["status"])))
	if tier2Status == "completed" || tier2Status == "approved" {
		return 2
	}

	if !hasTier2Record && hasAccount {
		return 2
	}

	return 1
}

func getOnboardingStageStatus(
	ctx context.Context,
	dbpool *pgxpool.Pool,
	userID string,
	stage string,
) (string, *string, error) {
	var (
		status string
		reason *string
	)
	err := dbpool.QueryRow(
		ctx,
		`SELECT status, reason
		   FROM onboarding_status
		  WHERE user_id = $1
		    AND stage = $2`,
		userID,
		stage,
	).Scan(&status, &reason)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil, nil
		}
		return "", nil, err
	}

	return strings.ToLower(strings.TrimSpace(status)), reason, nil
}

func canStartTier3Upgrade(ctx context.Context, dbpool *pgxpool.Pool, userID string) (bool, error) {
	tier2Status, _, err := getOnboardingStageStatus(ctx, dbpool, userID, "tier2")
	if err != nil {
		return false, err
	}

	switch tier2Status {
	case "approved", "completed":
		return true, nil
	}

	// Legacy support: account existence implies prior tier2 completion.
	hasAccount, err := userHasAccount(ctx, dbpool, userID)
	if err != nil {
		return false, err
	}
	return hasAccount, nil
}

func parseEnvPositiveInt(key string, fallback int, max int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}

	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}

func isSupportedTier3IDType(idType string) bool {
	switch strings.ToUpper(strings.TrimSpace(idType)) {
	case "DRIVERS_LICENSE", "VOTERS_CARD", "PASSPORT", "NATIONAL_ID", "NIN_SLIP":
		return true
	default:
		return false
	}
}

func normalizeISODate(value string) (string, error) {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return "", errors.New("date must be in YYYY-MM-DD format")
	}
	return parsed.UTC().Format("2006-01-02"), nil
}

func recordFailedTransactionPINAttemptTx(ctx context.Context, tx pgx.Tx, userID string, now time.Time) error {
	var failedAttempts int
	if err := tx.QueryRow(
		ctx,
		`SELECT failed_attempts FROM user_security_credentials WHERE user_id = $1`,
		userID,
	).Scan(&failedAttempts); err != nil {
		return err
	}

	nextAttempts := failedAttempts + 1
	var lockedUntil interface{}
	if nextAttempts >= 5 {
		lockUntilValue := now.Add(15 * time.Minute)
		lockedUntil = lockUntilValue
	}

	_, err := tx.Exec(
		ctx,
		`UPDATE user_security_credentials
		    SET failed_attempts = $2,
		        last_failed_at = NOW(),
		        locked_until = $3,
		        updated_at = NOW()
		  WHERE user_id = $1`,
		userID,
		nextAttempts,
		lockedUntil,
	)
	return err
}

func toString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, statusCode int, err error) {
	message := "Internal server error"
	switch statusCode {
	case http.StatusUnauthorized:
		message = "Unauthorized"
	case http.StatusNotFound:
		message = "User not found"
	case http.StatusBadRequest:
		message = "Bad request"
	case http.StatusPreconditionFailed:
		message = "Precondition failed"
	case http.StatusConflict:
		message = "Conflict"
	}

	if statusCode >= 500 {
		log.Printf("Request failed with %d: %v", statusCode, err)
	}

	payload := map[string]string{"error": message}
	if statusCode < 500 && err != nil {
		payload["detail"] = err.Error()
	}
	writeJSON(w, statusCode, payload)
}

func verifyRequiredSchema(ctx context.Context, dbpool *pgxpool.Pool) error {
	requiredTables := []string{
		"users",
		"accounts",
		"user_security_credentials",
		"onboarding_status",
		"onboarding_progress",
		"event_outbox",
	}

	for _, tableName := range requiredTables {
		exists, err := tableExists(ctx, dbpool, tableName)
		if err != nil {
			return err
		}
		if !exists {
			return errors.New("missing table: public." + tableName + " (run DB migrations first)")
		}
	}

	requiredColumnsByTable := map[string][]string{
		"users":                     {"id", "clerk_user_id", "email"},
		"accounts":                  {"user_id", "virtual_nuban", "bank_name"},
		"user_security_credentials": {"user_id", "transaction_pin_hash", "pin_set_at", "updated_at"},
		"onboarding_status":         {"user_id", "stage", "status", "reason", "updated_at"},
		"onboarding_progress":       {"clerk_user_id", "user_id", "user_type", "current_step", "payload", "updated_at"},
		"event_outbox": {
			"id",
			"exchange",
			"routing_key",
			"payload",
			"status",
			"attempts",
			"next_attempt_at",
			"processing_started_at",
			"published_at",
			"last_error",
			"created_at",
		},
	}

	for tableName, columns := range requiredColumnsByTable {
		for _, columnName := range columns {
			exists, err := columnExists(ctx, dbpool, tableName, columnName)
			if err != nil {
				return err
			}
			if !exists {
				return errors.New("missing column: public." + tableName + "." + columnName + " (run DB migrations first)")
			}
		}
	}

	return nil
}

func tableExists(ctx context.Context, dbpool *pgxpool.Pool, tableName string) (bool, error) {
	var exists bool
	err := dbpool.QueryRow(
		ctx,
		`SELECT EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = $1
		)`,
		tableName,
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func columnExists(
	ctx context.Context,
	dbpool *pgxpool.Pool,
	tableName string,
	columnName string,
) (bool, error) {
	var exists bool
	err := dbpool.QueryRow(
		ctx,
		`SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
		)`,
		tableName,
		columnName,
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}
