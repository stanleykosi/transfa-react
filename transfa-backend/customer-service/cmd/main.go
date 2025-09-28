/**
 * @description
 * This is the main entry point for the customer-service. It is responsible for
 * initializing the application, setting up dependencies, and starting the
 * RabbitMQ consumer to listen for events.
 *
 * Key features:
 * - Loads configuration from environment variables.
 * - Establishes and manages a connection pool to the PostgreSQL database.
 * - Sets up a RabbitMQ consumer to listen on a dedicated queue for 'user.created' events.
 * - Initializes the Anchor API client and the user repository.
 * - Wires up the event handler for processing incoming messages.
 * - Implements graceful shutdown to ensure clean resource cleanup.
 *
 * @dependencies
 * - github.com/jackc/pgx/v5/pgxpool: For database connection pooling.
 * - github.com/joho/godotenv: To load .env files for local development.
 * - github.com/transfa/customer-service/internal/app: Contains the core consumer logic.
 * - github.com/transfa/customer-service/internal/config: For loading application configuration.
 * - github.com/transfa/customer-service/internal/store: Contains the database repository implementation.
 * - github.com/transfa/customer-service/pkg/anchorclient: The client for interacting with the Anchor API.
 * - github.com/transfa/customer-service/pkg/rabbitmq: The shared RabbitMQ consumer logic.
 */
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/transfa/customer-service/internal/app"
	"github.com/transfa/customer-service/internal/config"
	"github.com/transfa/customer-service/internal/store"
	"github.com/transfa/customer-service/pkg/anchorclient"
	"github.com/transfa/customer-service/pkg/rabbitmq"
)

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

	// Set up dependencies
	userRepo := store.NewPostgresUserRepository(dbpool)
	anchorClient := anchorclient.NewClient(cfg.AnchorAPIBaseURL, cfg.AnchorAPIKey)
	eventHandler := app.NewUserEventHandler(userRepo, anchorClient)

	// Ensure onboarding status table exists
	if err := userRepo.EnsureOnboardingStatusTable(context.Background()); err != nil {
		log.Fatalf("Failed ensuring onboarding_status table: %v", err)
	}

	// Set up and start RabbitMQ consumer
	consumer, err := rabbitmq.NewConsumer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer consumer.Close()

	// Define consumer parameterss
	exchangeName := "user_events"
	queueName := "customer_service_user_created"
	routingKey := "user.created"

	// Start consuming messages in a separate goroutine
	go func() {
		log.Printf("Starting consumer for queue '%s'...", queueName)
		err := consumer.Consume(exchangeName, queueName, routingKey, eventHandler.HandleUserCreatedEvent)
		if err != nil {
			log.Fatalf("Consumer error: %v", err)
		}
	}()

	log.Println("Customer service is running. Waiting for events.")

	// Wait for termination signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down customer-service...")
}
