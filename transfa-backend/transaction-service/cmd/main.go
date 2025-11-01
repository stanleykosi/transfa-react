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
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/transaction-service/internal/api"
	"github.com/transfa/transaction-service/internal/app"
	"github.com/transfa/transaction-service/internal/config"
	"github.com/transfa/transaction-service/internal/store"
	"github.com/transfa/transaction-service/pkg/accountclient"
	"github.com/transfa/transaction-service/pkg/anchorclient"
	rmrabbit "github.com/transfa/transaction-service/pkg/rabbitmq"
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
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("unable to parse database URL: %v", err)
	}

	// Configure connection pool for high-traffic scenarios (100k+ users)
	// Align with account-service configuration for consistency
	poolConfig.MaxConns = 100
	poolConfig.MinConns = 20
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MaxConnIdleTime = 5 * time.Minute

	// Disable prepared statement caching to prevent conflicts
	poolConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	dbpool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		log.Fatalf("unable to connect to database: %v", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established.")

	// Initialize the RabbitMQ producer to publish events.
	// This service only needs to publish, so we use a producer.
	rabbitProducer, err := rmrabbit.NewEventProducer(cfg.RabbitMQURL)
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

	// Initialize the client for the account-service.
	accountClient := accountclient.NewClient(cfg.AccountServiceURL)
	log.Println("Account service client initialized.")

	// Initialize the data access layer (repository).
	repository := store.NewPostgresRepository(dbpool)

	// Initialize the core application service with its dependencies.
	transactionService := app.NewService(repository, anchorClient, accountClient, rabbitProducer, cfg.AdminAccountID, cfg.P2PTransactionFeeKobo, cfg.MoneyDropFeeKobo)

	// Initialize the API handlers.
	transactionHandlers := api.NewTransactionHandlers(transactionService)

	// Set up the HTTP router and define the API routes.
	router := chi.NewRouter()
	router.Mount("/transactions", api.TransactionRoutes(transactionHandlers, cfg.ClerkJWKSURL))

	// Start the HTTP server.
	// Use the same pattern as account-service - bind to all interfaces
	serverAddr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("Starting server on %s", serverAddr)

	// Wire up the new consumer: create a RabbitMQ consumer, bind to transfer status events, and ensure graceful shutdown.
	transferConsumer := transactionService.TransferStatusConsumer()

	rabbitConsumer, err := rmrabbit.NewConsumer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("could not initialize RabbitMQ consumer: %v", err)
	}
	defer rabbitConsumer.Close()

	transferBindings := map[string]func([]byte) bool{
		"transfer.status.nip.successful": transferConsumer.HandleMessage,
		"transfer.status.nip.failed":     transferConsumer.HandleMessage,
		"transfer.status.book.successful": transferConsumer.HandleMessage,
		"transfer.status.book.failed":     transferConsumer.HandleMessage,
	}

	if err := rabbitConsumer.ConsumeWithBindings("transfa.events", cfg.TransferEventQueue, transferBindings); err != nil {
		log.Fatalf("failed to start transfer consumer: %v", err)
	}

	server := &http.Server{
		Addr:    serverAddr,
		Handler: router,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("could not start server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("Shutting down transaction-service...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("Shutdown complete.")
}
