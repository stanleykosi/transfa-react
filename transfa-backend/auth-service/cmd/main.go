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

	// Establish database connection pool with better configuration
	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Unable to parse database URL: %v\n", err)
	}
	
	// Configure connection pool to prevent prepared statement conflicts
	dbConfig.MaxConns = 10
	dbConfig.MinConns = 2
	dbConfig.MaxConnLifetime = 30 * time.Minute
	dbConfig.MaxConnIdleTime = 5 * time.Minute
	
	// Disable prepared statement caching to prevent conflicts
	dbConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	
	dbpool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established")

	log.Printf("RABBITMQ_URL (masked)=%s", maskAMQPURLForLog(cfg.RabbitMQURL))

	// Set up RabbitMQ producer
	producer, err := rabbitmq.NewEventProducer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer producer.Close()
	log.Println("RabbitMQ producer connected")

	// Set up repository
	userRepo := store.NewPostgresUserRepository(dbpool)

	// Set up router and handlers
	r := chi.NewRouter()
	r.Use(middleware.Logger)    // Log API requests
	r.Use(middleware.Recoverer) // Recover from panics

	// Create the onboarding handler with its dependencies
	onboardingHandler := api.NewOnboardingHandler(userRepo, producer)

	// Define routes
	r.Post("/onboarding", onboardingHandler.ServeHTTP)
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
		status := "tier0_pending"
		if existing.AnchorCustomerID != nil {
			status = "tier0_created"
		}
		// Also surface any failure reason recorded by customer-service
		// Minimal inline query to onboarding_status (if exists)
		type row struct{ Status string; Reason *string }
		var reason *string
		if conn, err := dbpool.Acquire(r.Context()); err == nil {
			defer conn.Release()
			qr := conn.QueryRow(r.Context(), `SELECT reason FROM onboarding_status WHERE user_id = $1 AND stage = 'tier0'`, existing.ID)
			_ = qr.Scan(&reason)
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
