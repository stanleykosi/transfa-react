/**
 * @description
 * Entry point for the platform-fee service.
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

	"github.com/transfa/platform-fee-service/internal/api"
	"github.com/transfa/platform-fee-service/internal/app"
	"github.com/transfa/platform-fee-service/internal/config"
	"github.com/transfa/platform-fee-service/internal/store"
	platformrabbit "github.com/transfa/platform-fee-service/pkg/rabbitmq"
	"github.com/transfa/platform-fee-service/pkg/transactionclient"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	pgConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Error("unable to parse database URL", "error", err)
		os.Exit(1)
	}
	pgConfig.MaxConns = 100
	pgConfig.MinConns = 20
	pgConfig.MaxConnLifetime = 30 * time.Minute
	pgConfig.MaxConnIdleTime = 5 * time.Minute
	pgConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	dbpool, err := pgxpool.NewWithConfig(ctx, pgConfig)
	if err != nil {
		logger.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbpool.Close()
	logger.Info("database connection established")

	repository := store.NewRepository(dbpool)
	txClient := transactionclient.NewClient(cfg.TransactionServiceURL)

	var publisher app.EventPublisher = &platformrabbit.EventProducerFallback{}
	if cfg.RabbitMQURL != "" {
		if producer, err := platformrabbit.NewEventProducer(cfg.RabbitMQURL); err == nil {
			publisher = producer
			defer producer.Close()
		} else {
			logger.Warn("failed to connect to RabbitMQ, using fallback publisher", "error", err)
		}
	}

	service := app.NewService(repository, txClient, publisher, cfg.BusinessTimezone)
	handler := api.NewHandler(service)
	router := api.NewRouter(handler, cfg.ClerkJWKSURL, cfg.InternalAPIKey)

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

	<-sigCh
	logger.Info("shutdown signal received, gracefully shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("server shutdown failed", "error", err)
	}

	logger.Info("server stopped")
}
