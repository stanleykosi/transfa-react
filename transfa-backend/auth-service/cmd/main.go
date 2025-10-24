package main

import (
	"context"
	"encoding/json"
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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/transfa/auth-service/internal/api"
	"github.com/transfa/auth-service/internal/config"
	"github.com/transfa/auth-service/internal/store"
	"github.com/transfa/auth-service/pkg/rabbitmq"
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
	// Load .env file for local development. In production, env vars are set directly.
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Load application configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("cannot load config: %v", err)
	}

	// If a platform-provided PORT is set (e.g., Railway/Render), prefer it
	if port := os.Getenv("PORT"); port != "" {
		cfg.ServerPort = port
	}
	// Ensure we have a port fallback if neither env is set
	if cfg.ServerPort == "" {
		cfg.ServerPort = "8080"
	}

	// Establish database connection pool with better configuration
	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Unable to parse database URL: %v\n", err)
	}

	// Configure connection pool to prevent prepared statement conflict
	dbConfig.MaxConns = 10
	dbConfig.MinConns = 2
	dbConfig.MaxConnLifetime = 30 * time.Minute
	dbConfig.MaxConnIdleTime = 5 * time.Minute

	// Disable prepared statement caching to prevent conflicts
	dbConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	dbpool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established")

	log.Printf("RABBITMQ_URL (masked)=%s", maskAMQPURLForLog(cfg.RabbitMQURL))

	// Set up RabbitMQ producer with bounded dial timeout; allow nil on failure
	var producer *rabbitmq.EventProducer
	if p, err := rabbitmq.NewEventProducer(cfg.RabbitMQURL); err != nil {
		log.Printf("WARNING: Failed to connect to RabbitMQ at startup: %v. Continuing without MQ.", err)
		producer = nil
	} else {
		producer = p
		defer producer.Close()
		log.Println("RabbitMQ producer connected")
	}

	// Set up repository
	userRepo := store.NewPostgresUserRepository(dbpool)

	// Ensure required tables exist (idempotent)
	if _, err := dbpool.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS onboarding_status (
            user_id UUID NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, stage)
        );
        CREATE TABLE IF NOT EXISTS accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            anchor_account_id TEXT NOT NULL,
            virtual_nuban TEXT,
            account_type TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `); err != nil {
		log.Printf("Warning: failed ensuring tables (may already exist): %v", err)
	}

	// Set up router and handlers
	r := chi.NewRouter()
	r.Use(middleware.Logger)    // Log API requests
	r.Use(middleware.Recoverer) // Recover from panics

	// Create the onboarding handler with its dependencies
	onboardingHandler := api.NewOnboardingHandler(userRepo, producer)

	// Define routes
	r.Post("/onboarding", onboardingHandler.ServeHTTP)
	r.Post("/onboarding/tier2", onboardingHandler.HandleTier2)

	r.Get("/onboarding/status", func(w http.ResponseWriter, r *http.Request) {
		clerkUserID := r.Header.Get("X-Clerk-User-Id")
		if clerkUserID == "" {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Unauthorized: Clerk User ID missing"))
			return
		}

		// Minimal inline fetch to avoid new handler file; repository already constructed
		existing, err := userRepo.FindByClerkUserID(r.Context(), clerkUserID)
		if err != nil || existing == nil {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("User not found"))
			return
		}
		// Derive a normalized, frontend-friendly status
		// Priority: completed (has account) > tier2_pending > tier1_created/pending > new
		status := "new"
		var reason *string
		if conn, err := dbpool.Acquire(r.Context()); err == nil {
			defer conn.Release()

			// 1) Completed if user has any account
			var accountCount int
			_ = conn.QueryRow(r.Context(), `SELECT COUNT(1) FROM accounts WHERE user_id = $1`, existing.ID).Scan(&accountCount)
			if accountCount > 0 {
				status = "completed"
			} else {
				// 2) Tier2 status
				var t2 string
				if err := conn.QueryRow(r.Context(), `SELECT status, reason FROM onboarding_status WHERE user_id = $1 AND stage = 'tier2'`, existing.ID).Scan(&t2, &reason); err != nil {
					t2 = ""
				}
				if t2 != "" {
					// Treat any presence of tier2 record as pending until account exists unless completed with account
					status = "tier2_" + strings.ToLower(t2)
					if t2 == "failed" || t2 == "error" {
						status = "tier2_failed"
					}
					if t2 == "completed" {
						status = "tier2_completed"
					}
				} else {
					// 3) Tier1 status
					var t1 string
					_ = conn.QueryRow(r.Context(), `SELECT status, reason FROM onboarding_status WHERE user_id = $1 AND stage = 'tier1'`, existing.ID).Scan(&t1, &reason)
					if t1 != "" {
						switch t1 {
						case "created":
							status = "tier1_created"
						case "pending", "processing":
							status = "tier1_pending"
						case "failed":
							status = "tier1_failed"
						default:
							status = "tier1_" + t1
						}
					} else {
						status = "new"
					}
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if reason != nil {
			w.Write([]byte("{\"status\": \"" + status + "\", \"reason\": " + jsonString(*reason) + "}"))
			return
		}
		w.Write([]byte("{\"status\": \"" + status + "\"}"))
	})
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Auth service is healthy"))
	})

	// Endpoint to fetch the user's profile including username, email, and UUID
	r.Get("/me/profile", func(w http.ResponseWriter, r *http.Request) {
		clerkUserID := r.Header.Get("X-Clerk-User-Id")
		if clerkUserID == "" {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Unauthorized: Clerk User ID missing"))
			return
		}
		existing, err := userRepo.FindByClerkUserID(r.Context(), clerkUserID)
		if err != nil || existing == nil {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("User not found"))
			return
		}
		// Return user profile data
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(existing)
	})

	// Lightweight helper to fetch the user's primary account number (NUBAN) and bank name
	r.Get("/me/primary-account", func(w http.ResponseWriter, r *http.Request) {
		clerkUserID := r.Header.Get("X-Clerk-User-Id")
		if clerkUserID == "" {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Unauthorized: Clerk User ID missing"))
			return
		}
		existing, err := userRepo.FindByClerkUserID(r.Context(), clerkUserID)
		if err != nil || existing == nil {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("User not found"))
			return
		}
		var accountNumber, bankName *string
		if conn, err := dbpool.Acquire(r.Context()); err == nil {
			defer conn.Release()
			_ = conn.QueryRow(r.Context(), `SELECT virtual_nuban, bank_name FROM accounts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, existing.ID).Scan(&accountNumber, &bankName)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if accountNumber != nil {
			response := map[string]interface{}{
				"accountNumber": *accountNumber,
			}
			if bankName != nil && *bankName != "" {
				response["bankName"] = *bankName
			}
			json.NewEncoder(w).Encode(response)
		} else {
			w.Write([]byte("{}"))
		}
	})
	// Start the server
	server := &http.Server{
		Addr:    ":" + cfg.ServerPort,
		Handler: r,
	}

	go func() {
		log.Printf("Server starting on port %s", cfg.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Could not start server: %s\n", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}

	log.Println("Server gracefully stopped")
}

// jsonString safely marshals a string to a JSON quoted string, falling back if needed.
func jsonString(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		return "\"" + strings.ReplaceAll(s, "\"", "\\\"") + "\""
	}
	return string(b)
}
