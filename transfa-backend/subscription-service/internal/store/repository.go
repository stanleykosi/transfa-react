/**
 * @description
 * This file implements the data access layer for the subscription-service.
 * It contains all the SQL queries and logic for interacting with the database.
 */
package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/subscription-service/internal/domain"
)

// Repository handles database operations for subscriptions.
type Repository struct {
	db *pgxpool.Pool
}

// NewRepository creates a new repository.
func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// GetSubscriptionByUserID retrieves a subscription for a given user ID.
func (r *Repository) GetSubscriptionByUserID(ctx context.Context, userID string) (*domain.Subscription, error) {
	var sub domain.Subscription
	query := `
        SELECT id, user_id, status, current_period_start, current_period_end, auto_renew
        FROM subscriptions
        WHERE user_id = $1
    `
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&sub.ID,
		&sub.UserID,
		&sub.Status,
		&sub.CurrentPeriodStart,
		&sub.CurrentPeriodEnd,
		&sub.AutoRenew,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("subscription not found")
		}
		return nil, err
	}
	return &sub, nil
}

// CreateOrUpdateSubscription creates a new subscription or updates an existing one for a user.
func (r *Repository) CreateOrUpdateSubscription(ctx context.Context, sub *domain.Subscription) (*domain.Subscription, error) {
	var createdSub domain.Subscription
	query := `
        INSERT INTO subscriptions (user_id, status, current_period_start, current_period_end, auto_renew)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            auto_renew = EXCLUDED.auto_renew,
            updated_at = NOW()
        RETURNING id, user_id, status, current_period_start, current_period_end, auto_renew
    `
	err := r.db.QueryRow(ctx, query,
		sub.UserID,
		sub.Status,
		sub.CurrentPeriodStart,
		sub.CurrentPeriodEnd,
		sub.AutoRenew,
	).Scan(
		&createdSub.ID,
		&createdSub.UserID,
		&createdSub.Status,
		&createdSub.CurrentPeriodStart,
		&createdSub.CurrentPeriodEnd,
		&createdSub.AutoRenew,
	)

	if err != nil {
		return nil, err
	}
	return &createdSub, nil
}

// GetMonthlyTransferUsage retrieves the count of external transfers for a user in the current month.
func (r *Repository) GetMonthlyTransferUsage(ctx context.Context, userID string) (int, error) {
	var count int
	// The 'period' is the first day of the month.
	// DATE_TRUNC('month', NOW()) calculates the first day of the current month.
	query := `
        SELECT external_receipt_count
        FROM monthly_transfer_usage
        WHERE user_id = $1 AND period = DATE_TRUNC('month', NOW())
    `
	err := r.db.QueryRow(ctx, query, userID).Scan(&count)
	if err != nil {
		// If no row exists for this month, it means usage is 0.
		if err == pgx.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	return count, nil
}
