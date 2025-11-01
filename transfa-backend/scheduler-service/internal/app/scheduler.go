/**
 * @description
 * This file contains the cron scheduler setup. It uses the robfig/cron library
 * to schedule and run the jobs defined in jobs.go.
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
	// Create a new cron scheduler with a logger
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
	// Schedule the monthly billing job
	_, err := s.cron.AddFunc(s.config.BillingJobSchedule, s.jobs.ProcessMonthlyBilling)
	if err != nil {
		s.logger.Error("failed to schedule billing job", "error", err)
	} else {
		s.logger.Info("scheduled monthly billing job", "schedule", s.config.BillingJobSchedule)
	}

	// Schedule the job to reset monthly transfer usage
	_, err = s.cron.AddFunc(s.config.ResetUsageJobSchedule, s.jobs.ResetMonthlyTransferUsage)
	if err != nil {
		s.logger.Error("failed to schedule usage reset job", "error", err)
	} else {
		s.logger.Info("scheduled usage reset job", "schedule", s.config.ResetUsageJobSchedule)
	}

	// Schedule the money drop expiry job
	_, err = s.cron.AddFunc(s.config.MoneyDropExpirySchedule, s.jobs.ProcessMoneyDropExpiry)
	if err != nil {
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
