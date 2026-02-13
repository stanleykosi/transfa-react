/**
 * @description
 * This is the main entry point for the notification-service. Its primary role is to
 * start an HTTP server that listens for incoming webhooks from the Anchor BaaS platform.
 *
 * Key features:
 * - Loads application configuration from environment variables.
 * - Initializes a RabbitMQ producer to publish internal events based on received webhooks.
 * - Sets up an HTTP router (`chi`) to direct webhook traffic to the appropriate handler.
 * - Implements graceful shutdown to ensure clean resource cleanup on termination.
 *
 * @dependencies
 * - github.com/go-chi/chi/v5: A lightweight and idiomatic router for building Go HTTP services.
 * - github.com/joho/godotenv: For loading .env files during local development.
 * - The service's internal packages for config, API handling, and RabbitMQ -integration.
 */
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/transfa/notification-service/internal/api"
	"github.com/transfa/notification-service/internal/config"
	"github.com/transfa/notification-service/pkg/rabbitmq"
)

func main() {
	// Load .env file for local development.
	if err := godotenv.Load(); err != nil {
		log.Println("level=info component=bootstrap msg=\"env file not found; using process env\"")
	}

	// Load application configuration.
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("level=fatal component=bootstrap msg=\"config load failed\" err=%v", err)
	}

	// Use Railway's PORT env var if set, otherwise use configured SERVER_PORT
	// Railway requires services to listen on the PORT it provides for health checks
	if port := os.Getenv("PORT"); port != "" {
		cfg.ServerPort = port
	} else if cfg.ServerPort == "" {
		cfg.ServerPort = "8081"
	}

	// Set up RabbitMQ producer.
	producer, err := rabbitmq.NewEventProducer(cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("level=fatal component=bootstrap msg=\"rabbitmq connection failed\" err=%v", err)
	}
	defer producer.Close()
	log.Println("level=info component=bootstrap msg=\"rabbitmq connected\"")

	// Set up router and handlers.
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Create the webhook handler with its dependencies.
	webhookHandler := api.NewWebhookHandler(
		producer,
		cfg.AnchorWebhookSecret,
		cfg.AnchorAPIKey,
		cfg.AnchorAPIBaseURL,
	)

	// Define routes.
	r.Post("/webhooks/anchor", webhookHandler.ServeHTTP)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Notification service is healthy"))
	})

	// Start the HTTP server.
	server := &http.Server{
		Addr:    ":" + cfg.ServerPort,
		Handler: r,
	}

	go func() {
		log.Printf("level=info component=http msg=\"server starting\" port=%s", cfg.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("level=fatal component=http msg=\"server start failed\" err=%v", err)
		}
	}()

	// Graceful shutdown logic..
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("level=info component=http msg=\"shutdown started\"")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("level=fatal component=http msg=\"shutdown failed\" err=%v", err)
	}

	log.Println("level=info component=http msg=\"shutdown complete\"")
}
