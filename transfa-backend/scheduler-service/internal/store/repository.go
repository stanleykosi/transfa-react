/**
 * @description
 * This file implements the data access layer for the scheduler-service.
 * It contains all the SQL queries and logic for interacting with the database
 * for scheduled jobs.
 */
package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/scheduler-service/internal/domain"
)

// Repository handles database operations for the scheduler.
type Repository struct {
	db *pgxpool.Pool
}

// NewRepository creates a new repository.
func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// GetActiveSubscriptionsForBilling fetches all subscriptions that are 'active',
// have 'auto_renew' set to true, and where the current period has ended.
func (r *Repository) GetActiveSubscriptionsForBilling(ctx context.Context) ([]domain.Subscription, error) {
	var subs []domain.Subscription
	query := `
        SELECT id, user_id, status
        FROM subscriptions
        WHERE status = 'active'
          AND auto_renew = TRUE
          AND current_period_end <= NOW()
    `
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var sub domain.Subscription
		if err := rows.Scan(&sub.ID, &sub.UserID, &sub.Status); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}

	return subs, nil
}

// UpdateSubscriptionAfterBilling updates a subscription's period after a successful payment.
func (r *Repository) UpdateSubscriptionAfterBilling(ctx context.Context, subID string, newStartDate, newEndDate time.Time) error {
	query := `
        UPDATE subscriptions
        SET current_period_start = $1,
            current_period_end = $2,
            updated_at = NOW()
        WHERE id = $3
    `
	_, err := r.db.Exec(ctx, query, newStartDate, newEndDate, subID)
	return err
}

// SetSubscriptionStatusToLapsed updates a subscription's status to 'lapsed' on payment failure.
func (r *Repository) SetSubscriptionStatusToLapsed(ctx context.Context, subID string) error {
	query := `
        UPDATE subscriptions
        SET status = 'lapsed',
            updated_at = NOW()
        WHERE id = $1
    `
	_, err := r.db.Exec(ctx, query, subID)
	return err
}

// ResetAllMonthlyUsageCounts resets the transfer usage for all users for the current month.
// It inserts a new record for the month if one doesn't exist, or resets the count if it does.
func (r *Repository) ResetAllMonthlyUsageCounts(ctx context.Context) (int64, error) {
	// This query affects all users who have a record in the users table.
	// It ensures that every user has a usage record for the current month, set to 0.
	query := `
        INSERT INTO monthly_transfer_usage (user_id, period, external_receipt_count)
        SELECT id, DATE_TRUNC('month', NOW())::DATE, 0 FROM users
        ON CONFLICT (user_id, period) DO UPDATE
        SET external_receipt_count = 0,
            updated_at = NOW();
    `
	commandTag, err := r.db.Exec(ctx, query)
	if err != nil {
		return 0, err
	}
	return commandTag.RowsAffected(), nil
}

// GetExpiredAndCompletedMoneyDrops finds all expired or fully claimed money drops.
func (r *Repository) GetExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error) {
	var drops []domain.MoneyDrop
	query := `
		SELECT id, creator_id, amount_per_claim, total_claims_allowed,
		       claims_made_count, funding_source_account_id, money_drop_account_id
		FROM money_drops
		WHERE status = 'active'
		  AND (expiry_timestamp <= NOW() OR claims_made_count >= total_claims_allowed)
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var drop domain.MoneyDrop
		err := rows.Scan(
			&drop.ID, &drop.CreatorID, &drop.AmountPerClaim, &drop.TotalClaimsAllowed,
			&drop.ClaimsMadeCount, &drop.FundingSourceAccountID, &drop.MoneyDropAccountID)
		if err != nil {
			return nil, err
		}
		drops = append(drops, drop)
	}

	return drops, nil
}

// UpdateMoneyDropStatus updates the status of a money drop.
func (r *Repository) UpdateMoneyDropStatus(ctx context.Context, dropID string, status string) error {
	query := `UPDATE money_drops SET status = $1 WHERE id = $2`
	_, err := r.db.Exec(ctx, query, status, dropID)
	return err
}
