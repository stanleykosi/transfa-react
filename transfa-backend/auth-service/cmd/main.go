package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"encoding/json"
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

    // Set up RabbitMQ producer with bounded dial timeout
    var producer rabbitmq.Publisher
    p, err := rabbitmq.NewEventProducer(cfg.RabbitMQURL)
    if err != nil {
        // Don't block startup forever; log and continue with a no-op producer-like wrapper
        log.Printf("WARNING: Failed to connect to RabbitMQ at startup: %v. Onboarding events will be logged only until MQ is available.", err)
        producer = &rabbitmq.EventProducerFallback{}
    } else {
        producer = p
        defer producer.Close()
        log.Println("RabbitMQ producer connected")
    }

    // Set up repository
    userRepo := store.NewPostgresUserRepository(dbpool)

    // Ensure required tables exist (local DDL here since auth-service store doesn't expose it)
    if _, err := dbpool.Exec(context.Background(), `
        CREATE TABLE IF NOT EXISTS onboarding_status (
            user_id UUID NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, stage)
        )
    `); err != nil {
        log.Fatalf("failed ensuring onboarding_status table: %v", err)
    }

	// Set up router and handlers
	r := chi.NewRouter()
	r.Use(middleware.Logger)    // Log API requests
	r.Use(middleware.Recoverer) // Recover from panics

	// Create the onboarding handler with its dependencies
	onboardingHandler := api.NewOnboardingHandler(userRepo, producer)

	// Define routes
	r.Post("/onboarding", onboardingHandler.ServeHTTP)

    // Tier 1 submission: mark tier1 as created (for now), to unlock the app while verification completes
	r.Post("/onboarding/tier1", func(w http.ResponseWriter, r *http.Request) {
		clerkUserID := r.Header.Get("X-Clerk-User-Id")
		if clerkUserID == "" {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Unauthorized: Clerk User ID missing"))
			return
		}

		// Find existing user by Clerk ID
        existing, err := userRepo.FindByClerkUserID(r.Context(), clerkUserID)
		if err != nil || existing == nil {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("User not found"))
			return
		}

        // Idempotently record Tier 1 submission as created
        if _, err := dbpool.Exec(r.Context(), `
            INSERT INTO onboarding_status (user_id, stage, status, reason)
            VALUES ($1, 'tier1', 'created', NULL)
            ON CONFLICT (user_id, stage)
            DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, updated_at = NOW()
        `, existing.ID); err != nil {
            log.Printf("ERROR: failed to upsert tier1 status for user %s: %v", existing.ID, err)
            w.WriteHeader(http.StatusInternalServerError)
            w.Write([]byte("Failed to record Tier 1 status"))
            return
        }

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("{\"status\": \"tier1_created\"}"))
	})

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
		// Priority: completed (has account) > tier1_created > tier0_created/pending > new
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
				// 2) Tier1 status
				var t1 string
				_ = conn.QueryRow(r.Context(), `SELECT status FROM onboarding_status WHERE user_id = $1 AND stage = 'tier1'`, existing.ID).Scan(&t1)
				if t1 != "" {
					switch t1 {
					case "created":
						status = "tier1_created"
					case "failed":
						status = "tier1_failed"
					default:
						status = "tier1_" + t1
					}
				} else {
					// 3) Tier0 status
					var t0 string
					_ = conn.QueryRow(r.Context(), `SELECT status, reason FROM onboarding_status WHERE user_id = $1 AND stage = 'tier0'`, existing.ID).Scan(&t0, &reason)
					if t0 != "" {
						switch t0 {
						case "created":
							status = "tier0_created"
						case "pending", "processing":
							status = "tier0_pending"
						case "failed":
							status = "tier0_failed"
						default:
							status = "tier0_" + t0
						}
					} else if existing.AnchorCustomerID != nil {
						// Fallback: anchor customer exists => tier 0 created
						status = "tier0_created"
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
