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
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/transfa/auth-service/internal/api"
	"github.com/transfa/auth-service/internal/config"
	"github.com/transfa/auth-service/internal/domain"
	"github.com/transfa/auth-service/internal/store"
	"github.com/transfa/auth-service/pkg/rabbitmq"
)

type onboardingState struct {
	Status   string  `json:"status"`
	Reason   *string `json:"reason,omitempty"`
	NextStep string  `json:"next_step"`
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
	var producer *rabbitmq.EventProducer
	if p, err := rabbitmq.NewEventProducer(cfg.RabbitMQURL); err != nil {
		log.Printf("WARNING: Failed to connect to RabbitMQ at startup: %v. Continuing without MQ.", err)
		producer = nil
	} else {
		producer = p
		defer producer.Close()
		log.Println("RabbitMQ producer connected")
	}

	userRepo := store.NewPostgresUserRepository(dbpool)

	if err := verifyRequiredSchema(context.Background(), dbpool); err != nil {
		log.Fatalf("database schema validation failed: %v", err)
	}

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

	onboardingHandler := api.NewOnboardingHandler(userRepo, producer)
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
		r.Post("/onboarding/tier2", onboardingHandler.HandleTier2)

		r.Get("/onboarding/status", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}

			status, reason, err := deriveOnboardingStatus(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			writeJSON(w, http.StatusOK, onboardingState{Status: status, Reason: reason, NextStep: mapNextStep(status)})
		})

		r.Get("/me/profile", func(w http.ResponseWriter, r *http.Request) {
			existing, statusCode, err := resolveAuthenticatedUser(r, userRepo)
			if err != nil || existing == nil {
				writeError(w, statusCode, err)
				return
			}
			writeJSON(w, http.StatusOK, existing)
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
				writeError(w, statusCode, err)
				return
			}

			status, reason, err := deriveOnboardingStatus(r.Context(), dbpool, existing.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			clerkUserID, _ := api.GetClerkUserID(r.Context())
			writeJSON(w, http.StatusOK, authSessionResponse{
				Authenticated: true,
				ClerkUserID:   clerkUserID,
				User:          existing,
				Onboarding: onboardingState{
					Status:   status,
					Reason:   reason,
					NextStep: mapNextStep(status),
				},
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

	email := strings.TrimSpace(r.Header.Get("X-User-Email"))
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

func deriveOnboardingStatus(
	ctx context.Context,
	dbpool *pgxpool.Pool,
	userID string,
) (string, *string, error) {
	var accountCount int
	if err := dbpool.QueryRow(ctx, `SELECT COUNT(1) FROM accounts WHERE user_id = $1`, userID).Scan(&accountCount); err != nil {
		return "", nil, err
	}
	if accountCount > 0 {
		return "completed", nil, nil
	}

	var reason *string
	var tier2Status string
	if err := dbpool.QueryRow(
		ctx,
		`SELECT status, reason FROM onboarding_status WHERE user_id = $1 AND stage = 'tier2'`,
		userID,
	).Scan(&tier2Status, &reason); err == nil {
		t2 := strings.ToLower(strings.TrimSpace(tier2Status))
		if t2 == "failed" || t2 == "error" {
			return "tier2_failed", reason, nil
		}
		if t2 == "completed" {
			return "tier2_completed", reason, nil
		}
		if t2 != "" {
			return "tier2_" + t2, reason, nil
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, err
	}

	var tier1Status string
	reason = nil
	if err := dbpool.QueryRow(
		ctx,
		`SELECT status, reason FROM onboarding_status WHERE user_id = $1 AND stage = 'tier1'`,
		userID,
	).Scan(&tier1Status, &reason); err == nil {
		t1 := strings.ToLower(strings.TrimSpace(tier1Status))
		switch t1 {
		case "created":
			return "tier1_created", reason, nil
		case "pending", "processing":
			return "tier1_pending", reason, nil
		case "failed":
			return "tier1_failed", reason, nil
		default:
			if t1 != "" {
				return "tier1_" + t1, reason, nil
			}
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, err
	}

	return "new", nil, nil
}

func mapNextStep(status string) string {
	switch status {
	case "completed":
		return "app_tabs"
	case "tier2_processing", "tier2_pending", "tier2_manual_review", "tier2_error", "tier2_failed", "tier2_completed", "tier1_created":
		return "create_account"
	default:
		return "onboarding_form"
	}
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
	case http.StatusConflict:
		message = "Conflict"
	}

	if statusCode >= 500 {
		log.Printf("Request failed with %d: %v", statusCode, err)
	}

	writeJSON(w, statusCode, map[string]string{"error": message})
}

func verifyRequiredSchema(ctx context.Context, dbpool *pgxpool.Pool) error {
	requiredTables := []string{
		"users",
		"accounts",
		"onboarding_status",
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
		"users":             {"id", "clerk_user_id", "email"},
		"accounts":          {"user_id", "virtual_nuban", "bank_name"},
		"onboarding_status": {"user_id", "stage", "status", "reason", "updated_at"},
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
