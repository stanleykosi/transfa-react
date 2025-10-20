/**
 * @description
 * This is the main entry point for the subscription-service.
 * It initializes and wires together all the components of the application,
 * including configuration, database connection, repository, service, and the HTTP router.
 * Finally, it starts the HTTP server to listen for incoming requests.
 */
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

    "github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/transfa/subscription-service/internal/api"
	"github.com/transfa/subscription-service/internal/app"
	"github.com/transfa/subscription-service/internal/config"
	"github.com/transfa/subscription-service/internal/store"
)

func main() {
	// Initialize structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Load application configuration from environment variables
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	// Create a context that can be cancelled
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Set up channel to listen for OS signals
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

    // Establish connection to the PostgreSQL database with connection pool configuration
	config, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Error("unable to parse database URL", "error", err)
		os.Exit(1)
	}
	
	// Configure connection pool for high-traffic scenarios
	config.MaxConns = 100
	config.MinConns = 20
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

    // IMPORTANT: Disable prepared statements to work with PgBouncer transaction pooling
    // Use simple protocol to avoid statement cache errors (SQLSTATE 42P05)
    config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	
	dbpool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		logger.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbpool.Close()
	logger.Info("database connection established")

	// Database tables are already created via Supabase migrations
	// No need to create tables here - they exist in the database

	// Initialize application layers
	repository := store.NewRepository(dbpool)
	service := app.NewService(repository)
	handler := api.NewHandler(service)
	router := api.NewRouter(handler, cfg.ClerkJWKSURL)

	// Configure and start the HTTP server
	server := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.ServerPort),
		Handler: router,
	}

	go func() {
		logger.Info("starting server", "port", cfg.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed to start", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for an OS signal
	<-sigCh
	logger.Info("shutdown signal received, gracefully shutting down")

	// Create a context with a timeout for shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// Attempt to gracefully shut down the server
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("server shutdown failed", "error", err)
	}

	logger.Info("server stopped")
}
