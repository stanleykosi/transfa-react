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
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/transfa/account-service/internal/app"
	"github.com/transfa/account-service/internal/config"
	"github.com/transfa/account-service/internal/store"
	"github.com/transfa/account-service/pkg/anchorclient"
	"github.com/transfa/account-service/pkg/rabbitmq"
)

func main() {
	// Load .env file for local development.
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Load application configuration.
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("cannot load config: %v", err)
	}

	// Establish database connection pool.
	dbpool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer dbpool.Close()
	log.Println("Database connection established")

	// Set up dependencies.
	accountRepo := store.NewPostgresAccountRepository(dbpool)
	anchorClient := anchorclient.NewClient(cfg.AnchorAPIBaseURL, cfg.AnchorAPIKey)
	eventHandler := app.NewAccountEventHandler(accountRepo, anchorClient)

	// Set up and start RabbitMQ consumer.
	consumer, err := rabbitmq.NewConsumer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer consumer.Close()

	// Define consumer parameters.
	exchangeName := "customer_events"
	queueName := "account_service_customer_verified"
	routingKey := "customer.verified"

	// Start consuming messages in a separate goroutine.
	go func() {
		log.Printf("Starting consumer for queue '%s'...", queueName)
		err := consumer.Consume(exchangeName, queueName, routingKey, eventHandler.HandleCustomerVerifiedEvent)
		if err != nil {
			log.Fatalf("Consumer error: %v", err)
		}
	}()

	log.Println("Account service is running. Waiting for events.")

	// Wait for termination signal for graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down account-service...")
}
