/**
 * @description
 * This is the main entry point for the account-service. Its responsibility is to
 * initialize all necessary components and start the RabbitMQ consumer to listen for
 * events that trigger account provisioning.
 *
 * Key features:
 * - Loads application configuration from environment variables.
 * - Establishes and manages a connection pool to the PostgreSQL database.
 * - Initializes clients for external services (Anchor API).
 * - Wires up the core application logic (event handler) with its dependencies (repository, clients).
 * - Starts the message consumer and implements graceful shutdown.
 *
 * @dependencies
 * - The service's internal packages for config, app logic, storage, and external clients.
 * - pgxpool for database connection, godotenv for local config, and rabbitmq for messaging.
 */
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/transfa/account-service/internal/api"
	"github.com/transfa/account-service/internal/app"
	"github.com/transfa/account-service/internal/config"
	"github.com/transfa/account-service/internal/store"
	"github.com/transfa/account-service/pkg/anchorclient"
	"github.com/transfa/account-service/pkg/rabbitmq"
)

func main() {
	// Load .env file for local development..
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Load application configuration.
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("cannot load config: %v", err)
	}

	// Establish database connection pool with better configuration.
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
	dbConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	
	dbpool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established")

	// Set up dependencies.
	repo := store.NewPostgresAccountRepository(dbpool)
	anchorClient := anchorclient.NewClient(cfg.AnchorAPIBaseURL, cfg.AnchorAPIKey)
	
	// Setup services
	accountService := app.NewAccountService(repo, anchorClient)
	eventHandler := app.NewAccountEventHandler(repo, anchorClient)
	
	// Setup RabbitMQ consumer.
	consumer, err := rabbitmq.NewConsumer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer consumer.Close()

	// Start consuming messages in a goroutine.
	go func() {
		log.Printf("Starting consumer for event 'customer.verified'...")
		err := consumer.Consume("customer_events", "account_service_customer_verified", "customer.verified", eventHandler.HandleCustomerVerifiedEvent)
		if err != nil {
			log.Printf("Consumer error: %v", err) // Log as non-fatal
		}
	}()

	// Setup and start HTTP server.
	router := api.NewRouter(cfg, accountService)
	server := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.ServerPort),
		Handler: router,
	}

	go func() {
		log.Printf("Starting HTTP server on port %s", cfg.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Could not start server: %s\n", err)
		}
	}()

	log.Println("Account service is running with API and event consumer.")

	// Wait for termination signal for graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	
	log.Println("Shutting down account-service...")

	// Create a context with a timeout for shutdown.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Shutdown the HTTP server.
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}

	log.Println("Server gracefully stopped")
}
