/**
 * @description
 * Cron scheduler setup for scheduled jobs.
 */
package app

import (
	"context"
	"log/slog"

	"github.com/robfig/cron/v3"
	"github.com/transfa/scheduler-service/internal/config"
)

// Scheduler manages the cron jobs.
type Scheduler struct {
	cron   *cron.Cron
	jobs   *Jobs
	logger *slog.Logger
	config config.Config
}

// NewScheduler creates a new scheduler instance.
func NewScheduler(jobs *Jobs, logger *slog.Logger, cfg config.Config) *Scheduler {
	cronLogger := cron.PrintfLogger(slog.NewLogLogger(logger.Handler(), slog.LevelInfo))
	c := cron.New(cron.WithChain(cron.Recover(cronLogger)))

	return &Scheduler{
		cron:   c,
		jobs:   jobs,
		logger: logger,
		config: cfg,
	}
}

// Start registers the jobs and starts the cron scheduler.
func (s *Scheduler) Start() {
	if _, err := s.cron.AddFunc(s.config.PlatformFeeInvoiceJobSchedule, s.jobs.GeneratePlatformFeeInvoices); err != nil {
		s.logger.Error("failed to schedule platform fee invoice job", "error", err)
	} else {
		s.logger.Info("scheduled platform fee invoice job", "schedule", s.config.PlatformFeeInvoiceJobSchedule)
	}

	if _, err := s.cron.AddFunc(s.config.PlatformFeeChargeJobSchedule, s.jobs.ProcessPlatformFeeAttempts); err != nil {
		s.logger.Error("failed to schedule platform fee charge job", "error", err)
	} else {
		s.logger.Info("scheduled platform fee charge job", "schedule", s.config.PlatformFeeChargeJobSchedule)
	}

	if _, err := s.cron.AddFunc(s.config.PlatformFeeDelinqJobSchedule, s.jobs.ProcessPlatformFeeDelinquency); err != nil {
		s.logger.Error("failed to schedule platform fee delinquency job", "error", err)
	} else {
		s.logger.Info("scheduled platform fee delinquency job", "schedule", s.config.PlatformFeeDelinqJobSchedule)
	}

	if _, err := s.cron.AddFunc(s.config.MoneyDropExpirySchedule, s.jobs.ProcessMoneyDropExpiry); err != nil {
		s.logger.Error("failed to schedule money drop expiry job", "error", err)
	} else {
		s.logger.Info("scheduled money drop expiry job", "schedule", s.config.MoneyDropExpirySchedule)
	}

	s.cron.Start()
}

// Stop gracefully stops the cron scheduler.
func (s *Scheduler) Stop() context.Context {
	return s.cron.Stop()
}
