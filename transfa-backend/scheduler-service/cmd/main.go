/**
 * @description
 * This is the main entry point for the scheduler-service.
 * This service is a non-HTTP, long-running process that executes scheduled tasks (cron jobs).
 * It initializes the configuration, database connection, and the cron scheduler, then starts it.
 */
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/scheduler-service/internal/app"
	"github.com/transfa/scheduler-service/internal/config"
	"github.com/transfa/scheduler-service/internal/store"
	"github.com/transfa/scheduler-service/pkg/transactionclient"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Load application configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()

	// Establish database connection with connection pool configuration
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
	
	// Disable prepared statement caching to prevent conflicts
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	
	dbpool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		logger.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbpool.Close()
	logger.Info("database connection established")

	// Initialize dependencies
	repository := store.NewRepository(dbpool)
	txClient := transactionclient.NewClient(cfg.TransactionServiceURL)
	jobs := app.NewJobs(repository, txClient, logger, *cfg)
	scheduler := app.NewScheduler(jobs, logger, *cfg)

	// Start the cron scheduler in the background
	scheduler.Start()
	logger.Info("scheduler started")

	// Wait for termination signal to gracefully shut down
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	// Stop the scheduler
	logger.Info("shutdown signal received, stopping scheduler")
	stopCtx := scheduler.Stop()
	<-stopCtx.Done() // Wait for scheduler to fully stop
	logger.Info("scheduler stopped gracefully")
}
