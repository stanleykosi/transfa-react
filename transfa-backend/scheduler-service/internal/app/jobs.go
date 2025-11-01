/**
 * @description
 * This file contains the implementation of the scheduled jobs (cron jobs)
 * for the scheduler-service. Each job is a method on the Jobs struct.
 */
package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/transfa/scheduler-service/internal/config"
	"github.com/transfa/scheduler-service/internal/domain"
	_ "github.com/transfa/scheduler-service/internal/store"
	_ "github.com/transfa/scheduler-service/pkg/transactionclient"
)

// Repository defines the database operations needed by the jobs.
type Repository interface {
	GetActiveSubscriptionsForBilling(ctx context.Context) ([]domain.Subscription, error)
	UpdateSubscriptionAfterBilling(ctx context.Context, subID string, newStartDate, newEndDate time.Time) error
	SetSubscriptionStatusToLapsed(ctx context.Context, subID string) error
	ResetAllMonthlyUsageCounts(ctx context.Context) (int64, error)
	GetExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error)
	UpdateMoneyDropStatus(ctx context.Context, dropID string, status string) error
}

// TransactionClient defines the interface for communicating with the transaction service.
type TransactionClient interface {
	DebitSubscriptionFee(ctx context.Context, userID string, amount int64) error
	RefundMoneyDrop(ctx context.Context, dropID, creatorID string, amount int64) error
}

// Jobs contains the logic for all scheduled tasks.
type Jobs struct {
	repo     Repository
	txClient TransactionClient
	logger   *slog.Logger
	config   config.Config
}

// NewJobs creates a new Jobs runner.
func NewJobs(repo Repository, txClient TransactionClient, logger *slog.Logger, cfg config.Config) *Jobs {
	return &Jobs{
		repo:     repo,
		txClient: txClient,
		logger:   logger,
		config:   cfg,
	}
}

// ProcessMonthlyBilling is the job that handles billing for active subscriptions.
func (j *Jobs) ProcessMonthlyBilling() {
	j.logger.Info("starting monthly billing job")
	ctx := context.Background()

	// 1. Fetch all subscriptions eligible for billing
	subs, err := j.repo.GetActiveSubscriptionsForBilling(ctx)
	if err != nil {
		j.logger.Error("failed to get subscriptions for billing", "error", err)
		return
	}

	if len(subs) == 0 {
		j.logger.Info("no subscriptions to bill this cycle")
		return
	}

	j.logger.Info("found subscriptions to process", "count", len(subs))

	// 2. Process each subscription
	for _, sub := range subs {
		j.logger.Info("processing subscription", "subscription_id", sub.ID, "user_id", sub.UserID)

		// 3. Call transaction-service to debit the user's account
		err := j.txClient.DebitSubscriptionFee(ctx, sub.UserID, j.config.SubscriptionFeeKobo)
		if err != nil {
			// 4a. If debit fails (e.g., insufficient funds), set status to 'lapsed'
			j.logger.Warn("failed to debit subscription fee", "subscription_id", sub.ID, "user_id", sub.UserID, "error", err)
			if err := j.repo.SetSubscriptionStatusToLapsed(ctx, sub.ID); err != nil {
				j.logger.Error("failed to set subscription status to lapsed", "subscription_id", sub.ID, "error", err)
			}
			continue // Move to the next subscription
		}

		// 4b. If debit is successful, update the subscription period
		now := time.Now()
		newPeriodEnd := now.AddDate(0, 1, 0) // Add 1 month
		if err := j.repo.UpdateSubscriptionAfterBilling(ctx, sub.ID, now, newPeriodEnd); err != nil {
			j.logger.Error("failed to update subscription period after billing", "subscription_id", sub.ID, "error", err)
		} else {
			j.logger.Info("successfully billed subscription", "subscription_id", sub.ID, "user_id", sub.UserID)
		}
	}

	j.logger.Info("monthly billing job finished")
}

// ResetMonthlyTransferUsage is the job that resets the free transfer usage counter for all users.
func (j *Jobs) ResetMonthlyTransferUsage() {
	j.logger.Info("starting monthly transfer usage reset job")
	ctx := context.Background()

	rowsAffected, err := j.repo.ResetAllMonthlyUsageCounts(ctx)
	if err != nil {
		j.logger.Error("failed to reset monthly transfer usage counts", "error", err)
		return
	}

	j.logger.Info("monthly transfer usage reset job finished", "users_affected", rowsAffected)
}

// ProcessMoneyDropExpiry is the job that handles refunding expired or completed money drops.
func (j *Jobs) ProcessMoneyDropExpiry() {
	j.logger.Info("starting money drop expiry job")
	ctx := context.Background()

	// 1. Fetch all expired or completed money drops
	drops, err := j.repo.GetExpiredAndCompletedMoneyDrops(ctx)
	if err != nil {
		j.logger.Error("failed to get expired money drops", "error", err)
		return
	}

	if len(drops) == 0 {
		j.logger.Info("no expired or completed money drops to process")
		return
	}

	j.logger.Info("found money drops to process", "count", len(drops))

	// 2. Process each drop
	for _, drop := range drops {
		j.logger.Info("processing money drop", "drop_id", drop.ID, "creator_id", drop.CreatorID)

		// Calculate remaining balance
		totalAmount := drop.AmountPerClaim * int64(drop.TotalClaimsAllowed)
		claimedAmount := drop.AmountPerClaim * int64(drop.ClaimsMadeCount)
		remainingBalance := totalAmount - claimedAmount

		if remainingBalance > 0 {
			j.logger.Info("refunding remaining balance", "drop_id", drop.ID, "amount", remainingBalance)

			// Call transaction-service to refund the balance
			err := j.txClient.RefundMoneyDrop(ctx, drop.ID, drop.CreatorID, remainingBalance)
			if err != nil {
				j.logger.Error("failed to refund money drop", "drop_id", drop.ID, "error", err)
				continue // Move to next drop
			}
		}

		// Mark the drop as processed
		if err := j.repo.UpdateMoneyDropStatus(ctx, drop.ID, "expired_and_refunded"); err != nil {
			j.logger.Error("failed to update money drop status", "drop_id", drop.ID, "error", err)
		} else {
			j.logger.Info("successfully processed money drop", "drop_id", drop.ID)
		}
	}

	j.logger.Info("money drop expiry job finished")
}
