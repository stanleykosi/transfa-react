/**
 * @description
 * This is the main entry point for the transaction-service. It is responsible for
 * initializing all components of the service, including configuration, database connection,
 * external API clients, message brokers, repositories, the core application service,
 * and the HTTP server. It wires everything together and starts the service.
 *
 * @dependencies
 * - log, net/http: Standard Go libraries for logging and HTTP server functionality.
 * - github.com/go-chi/chi/v5: For HTTP routing.
 * - github.com/jackc/pgx/v5: PostgreSQL driver.
 * - internal/api, internal/app, internal/config, internal/store: Internal packages for the service.
 * - pkg/anchorclient: Client for the Anchor BaaS API.
 * - pkg/rabbitmq: Client for RabbitMQ.
 */

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/transaction-service/internal/api"
	"github.com/transfa/transaction-service/internal/app"
	"github.com/transfa/transaction-service/internal/config"
	"github.com/transfa/transaction-service/internal/store"
	"github.com/transfa/transaction-service/pkg/anchorclient"
	"github.com/transfa/transaction-service/pkg/rabbitmq"
)

func main() {
	// Load application configuration from environment variables.
	cfg, err := config.LoadConfig(".")
	if err != nil {
		log.Fatalf("could not load config: %v", err)
	}

	// Use the configured SERVER_PORT (defaults to 8083, can be overridden by environment)
	// This matches the pattern used by account-service
	log.Printf("Using SERVER_PORT: %s", cfg.ServerPort)

	// Establish a connection pool to the PostgreSQL database with retry logic.
	config, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("unable to parse database URL: %v", err)
	}
	
	// Configure connection pool for high-traffic scenarios (100k+ users)
	// Align with account-service configuration for consistency
	config.MaxConns = 100
	config.MinConns = 20
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	
	// Disable prepared statement caching to prevent conflicts
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	
	dbpool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		log.Fatalf("unable to connect to database: %v", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established.")

	// Initialize the RabbitMQ producer to publish events.
	// This service only needs to publish, so we use a producer.
	rabbitProducer, err := rabbitmq.NewEventProducer(cfg.RabbitMQURL)
	if err != nil {
		log.Printf("WARNING: Failed to connect to RabbitMQ at startup: %v. Continuing without MQ.", err)
		rabbitProducer = nil
	} else {
		defer rabbitProducer.Close()
		log.Println("RabbitMQ producer initialized.")
	}

	// Initialize the client for the Anchor BaaS API.
	anchorClient := anchorclient.NewClient(cfg.AnchorAPIBaseURL, cfg.AnchorAPIKey)
	log.Println("Anchor API client initialized.")

	// Initialize the data access layer (repository).
	repository := store.NewPostgresRepository(dbpool)

	// Initialize the core application service with its dependencies.
	transactionService := app.NewService(repository, anchorClient, rabbitProducer, cfg.AdminAccountID)

	// Initialize the API handlers.
	transactionHandlers := api.NewTransactionHandlers(transactionService)

	// Set up the HTTP router and define the API routes.
	router := chi.NewRouter()
	router.Mount("/transactions", api.TransactionRoutes(transactionHandlers, cfg.ClerkJWKSURL))

	// Start the HTTP server.
	// Use the same pattern as account-service - bind to all interfaces
	serverAddr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("Starting server on %s", serverAddr)
	if err := http.ListenAndServe(serverAddr, router); err != nil {
		log.Fatalf("could not start server: %v", err)
	}
}
