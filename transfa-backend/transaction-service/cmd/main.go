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
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
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
		log.Fatalf("level=fatal component=bootstrap msg=\"config load failed\" err=%v", err)
	}
	if strings.TrimSpace(cfg.InternalAPIKey) == "" {
		log.Fatalf("level=fatal component=bootstrap msg=\"internal api key must be configured\" env=INTERNAL_API_KEY")
	}

	// Use the configured SERVER_PORT (defaults to 8083, can be overridden by environment)
	// This matches the pattern used by account-service
	log.Printf("level=info component=bootstrap msg=\"starting transaction-service\" port=%s", cfg.ServerPort)

	// Establish a connection pool to the PostgreSQL database with retry logic.
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("level=fatal component=bootstrap msg=\"database url parse failed\" err=%v", err)
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
		log.Fatalf("level=fatal component=bootstrap msg=\"database connection failed\" err=%v", err)
	}
	defer dbpool.Close()
	log.Println("level=info component=bootstrap msg=\"database connected\"")

	// Initialize the RabbitMQ producer to publish events.
	// This service only needs to publish, so we use a producer.
	rabbitProducer, err := rmrabbit.NewEventProducer(cfg.RabbitMQURL)
	if err != nil {
		log.Printf("level=warn component=bootstrap msg=\"rabbitmq producer unavailable; using fallback\" err=%v", err)
		rabbitProducer = nil
	} else {
		defer rabbitProducer.Close()
		log.Println("level=info component=bootstrap msg=\"rabbitmq producer connected\"")
	}

	// Initialize the client for the Anchor BaaS API.
	anchorClient := anchorclient.NewClient(cfg.AnchorAPIBaseURL, cfg.AnchorAPIKey)

	// Initialize the client for the account-service. Missing account-service config should not
	// prevent transaction-service from booting; money-drop account provisioning will degrade.
	var accountClient *accountclient.Client
	if strings.TrimSpace(cfg.AccountServiceURL) == "" || strings.TrimSpace(cfg.AccountServiceInternalAPIKey) == "" {
		log.Printf("level=warn component=bootstrap msg=\"account-service client not configured; money-drop account provisioning disabled\" account_service_url_set=%t account_service_internal_key_set=%t",
			strings.TrimSpace(cfg.AccountServiceURL) != "",
			strings.TrimSpace(cfg.AccountServiceInternalAPIKey) != "",
		)
	} else {
		accountClient = accountclient.NewClient(cfg.AccountServiceURL, cfg.AccountServiceInternalAPIKey)
	}

	var redisClient *redis.Client
	rateLimitingEnabled := cfg.MoneyDropClaimRateLimitPerMinute > 0 || cfg.MoneyDropDetailsRateLimitPerMinute > 0
	if rateLimitingEnabled {
		if strings.TrimSpace(cfg.RedisURL) == "" {
			log.Println("level=warn component=bootstrap msg=\"redis url missing; money-drop rate limiting disabled\" env=REDIS_URL")
		} else {
			redisOptions, parseErr := redis.ParseURL(cfg.RedisURL)
			if parseErr != nil {
				log.Printf("level=warn component=bootstrap msg=\"redis url parse failed; money-drop rate limiting disabled\" err=%v", parseErr)
			} else {
				redisClient = redis.NewClient(redisOptions)
				pingCtx, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancelPing()
				if pingErr := redisClient.Ping(pingCtx).Err(); pingErr != nil {
					log.Printf("level=warn component=bootstrap msg=\"redis ping failed; money-drop rate limiting disabled\" err=%v", pingErr)
					redisClient.Close()
					redisClient = nil
				} else {
					defer redisClient.Close()
					log.Println("level=info component=bootstrap msg=\"redis connected\"")
				}
			}
		}
	}

	// Initialize the data access layer (repository).
	repository := store.NewPostgresRepository(dbpool)

	// Initialize the core application service with its dependencies.
	transactionService := app.NewService(
		repository,
		anchorClient,
		accountClient,
		rabbitProducer,
		cfg.AdminAccountID,
		cfg.P2PTransactionFeeKobo,
		cfg.MoneyDropFeeKobo,
		cfg.MoneyDropFeePercent,
		cfg.MoneyDropShareBaseURL,
		cfg.MoneyDropPasswordKey,
	)
	transactionService.ConfigureMoneyDropHardening(
		cfg.MoneyDropClaimRateLimitPerMinute,
		cfg.MoneyDropDetailsRateLimitPerMinute,
		cfg.MoneyDropPasswordMaxAttempts,
		cfg.MoneyDropPasswordLockoutSeconds,
		cfg.MoneyDropClaimIdempotencyTTLMin,
	)
	if redisClient != nil {
		transactionService.SetMoneyDropRateLimiter(
			app.NewRedisMoneyDropRateLimiter(redisClient, cfg.RedisRateLimitPrefix),
		)
	}

	// Initialize the API handlers.
	transactionHandlers := api.NewTransactionHandlers(transactionService, cfg.InternalAPIKey)

	// Set up the HTTP router and define the API routes.
	router := chi.NewRouter()
	router.Mount("/transactions", api.TransactionRoutes(transactionHandlers, cfg.ClerkJWKSURL))

	// Start the HTTP server.
	// Use the same pattern as account-service - bind to all interfaces
	serverAddr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("level=info component=http msg=\"server listening\" addr=%s", serverAddr)

	// Wire up the new consumer: create a RabbitMQ consumer, bind to transfer status events, and ensure graceful shutdown.
	transferConsumer := transactionService.TransferStatusConsumer()

	rabbitConsumer, err := rmrabbit.NewConsumer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("level=fatal component=bootstrap msg=\"rabbitmq consumer init failed\" err=%v", err)
	}
	defer rabbitConsumer.Close()

	transferBindings := map[string]func([]byte) bool{
		"transfer.status.nip.processing":  transferConsumer.HandleMessage,
		"transfer.status.nip.successful":  transferConsumer.HandleMessage,
		"transfer.status.nip.failed":      transferConsumer.HandleMessage,
		"transfer.status.book.processing": transferConsumer.HandleMessage,
		"transfer.status.book.successful": transferConsumer.HandleMessage,
		"transfer.status.book.failed":     transferConsumer.HandleMessage,
	}

	if err := rabbitConsumer.ConsumeWithBindings("transfa.events", cfg.TransferEventQueue, transferBindings); err != nil {
		log.Fatalf("level=fatal component=bootstrap msg=\"transfer consumer start failed\" err=%v", err)
	}

	server := &http.Server{
		Addr:    serverAddr,
		Handler: router,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("level=fatal component=http msg=\"server stopped unexpectedly\" err=%v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("level=info component=http msg=\"shutdown started\"")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("level=error component=http msg=\"shutdown failed\" err=%v", err)
	}

	log.Println("level=info component=http msg=\"shutdown complete\"")
}
