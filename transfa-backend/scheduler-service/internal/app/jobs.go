/**
 * @description
 * Scheduled job implementations for the scheduler-service.
 */
package app

import (
	"context"
	"log/slog"

	"github.com/transfa/scheduler-service/internal/config"
	"github.com/transfa/scheduler-service/internal/domain"
)

// Repository defines database operations needed by the jobs.
type Repository interface {
	GetExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error)
	UpdateMoneyDropStatus(ctx context.Context, dropID string, status string) error
}

// TransactionClient defines the interface for communicating with the transaction service.
type TransactionClient interface {
	RefundMoneyDrop(ctx context.Context, dropID, creatorID string, amount int64) error
}

// PlatformFeeClient defines the interface for platform fee operations.
type PlatformFeeClient interface {
	GenerateInvoices(ctx context.Context) error
	RunChargeAttempts(ctx context.Context) error
	MarkDelinquent(ctx context.Context) error
}

// Jobs contains the logic for all scheduled tasks.
type Jobs struct {
	repo           Repository
	txClient       TransactionClient
	feeClient      PlatformFeeClient
	logger         *slog.Logger
	config         config.Config
}

// NewJobs creates a new Jobs runner.
func NewJobs(repo Repository, txClient TransactionClient, feeClient PlatformFeeClient, logger *slog.Logger, cfg config.Config) *Jobs {
	return &Jobs{
		repo:      repo,
		txClient:  txClient,
		feeClient: feeClient,
		logger:   logger,
		config:   cfg,
	}
}

// GeneratePlatformFeeInvoices triggers invoice generation.
func (j *Jobs) GeneratePlatformFeeInvoices() {
	j.logger.Info("starting platform fee invoice generation job")
	ctx := context.Background()

	if err := j.feeClient.GenerateInvoices(ctx); err != nil {
		j.logger.Error("failed to generate platform fee invoices", "error", err)
		return
	}

	j.logger.Info("platform fee invoice generation job finished")
}

// ProcessPlatformFeeAttempts triggers charge attempts.
func (j *Jobs) ProcessPlatformFeeAttempts() {
	j.logger.Info("starting platform fee charge attempts job")
	ctx := context.Background()

	if err := j.feeClient.RunChargeAttempts(ctx); err != nil {
		j.logger.Error("failed to run platform fee charge attempts", "error", err)
		return
	}

	j.logger.Info("platform fee charge attempts job finished")
}

// ProcessPlatformFeeDelinquency updates delinquent invoices.
func (j *Jobs) ProcessPlatformFeeDelinquency() {
	j.logger.Info("starting platform fee delinquency job")
	ctx := context.Background()

	if err := j.feeClient.MarkDelinquent(ctx); err != nil {
		j.logger.Error("failed to mark delinquent invoices", "error", err)
		return
	}

	j.logger.Info("platform fee delinquency job finished")
}

// ProcessMoneyDropExpiry is the job that handles refunding expired or completed money drops.
func (j *Jobs) ProcessMoneyDropExpiry() {
	j.logger.Info("starting money drop expiry job")
	ctx := context.Background()

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

	for _, drop := range drops {
		j.logger.Info("processing money drop", "drop_id", drop.ID, "creator_id", drop.CreatorID)

		totalAmount := drop.AmountPerClaim * int64(drop.TotalClaimsAllowed)
		claimedAmount := drop.AmountPerClaim * int64(drop.ClaimsMadeCount)
		remainingBalance := totalAmount - claimedAmount

		if remainingBalance > 0 {
			j.logger.Info("refunding remaining balance", "drop_id", drop.ID, "creator_id", drop.CreatorID, "amount", remainingBalance)

			if err := j.txClient.RefundMoneyDrop(ctx, drop.ID, drop.CreatorID, remainingBalance); err != nil {
				j.logger.Error("failed to refund money drop", "drop_id", drop.ID, "creator_id", drop.CreatorID, "amount", remainingBalance, "error", err)
				continue
			}
			j.logger.Info("successfully refunded money drop", "drop_id", drop.ID, "amount", remainingBalance)
		}

		if err := j.repo.UpdateMoneyDropStatus(ctx, drop.ID, "expired_and_refunded"); err != nil {
			j.logger.Error("failed to update money drop status", "drop_id", drop.ID, "error", err)
		} else {
			j.logger.Info("successfully processed money drop", "drop_id", drop.ID)
		}
	}

	j.logger.Info("money drop expiry job finished")
}
