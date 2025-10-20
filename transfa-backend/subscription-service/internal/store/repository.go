/**
 * @description
 * This file implements the data access layer for the subscription-service.
 * It contains all the SQL queries and logic for interacting with the database.
 */
package store

import (
    "context"
    "errors"
    "log"

    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/transfa/subscription-service/internal/domain"
)

// Define error constants
var ErrSubscriptionNotFound = errors.New("subscription not found")
var ErrUserNotFound = errors.New("user not found")

// Repository handles database operations for subscriptions.
type Repository struct {
	db *pgxpool.Pool
}

// NewRepository creates a new repository.
func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// FindUserIDByClerkUserID resolves the internal UUID from a Clerk user id string.
func (r *Repository) FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error) {
    log.Printf("Repository: Resolving internal user id for clerk_user_id: %s", clerkUserID)
    var id string
    err := r.db.QueryRow(ctx, "SELECT id FROM users WHERE clerk_user_id = $1", clerkUserID).Scan(&id)
    if err != nil {
        if err == pgx.ErrNoRows {
            log.Printf("Repository: No user found for clerk_user_id: %s", clerkUserID)
            return "", ErrUserNotFound
        }
        log.Printf("Repository: Error resolving user id for clerk_user_id %s: %v", clerkUserID, err)
        return "", err
    }
    log.Printf("Repository: Resolved clerk_user_id %s to internal user id %s", clerkUserID, id)
    return id, nil
}

// GetSubscriptionByUserID retrieves a subscription for a given user ID.
func (r *Repository) GetSubscriptionByUserID(ctx context.Context, userID string) (*domain.Subscription, error) {
	log.Printf("Repository: Looking up subscription for user ID: %s", userID)
	
	var sub domain.Subscription
	query := `
        SELECT id, user_id, status, current_period_start, current_period_end, auto_renew
        FROM subscriptions
        WHERE user_id = $1::UUID
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
		log.Printf("Repository: Query error for user %s: %v", userID, err)
		if err == pgx.ErrNoRows {
			log.Printf("Repository: No subscription found for user %s", userID)
			return nil, ErrSubscriptionNotFound
		}
		return nil, err
	}
	
	log.Printf("Repository: Found subscription for user %s: %+v", userID, sub)
	return &sub, nil
}

// CreateOrUpdateSubscription creates a new subscription or updates an existing one for a user.
func (r *Repository) CreateOrUpdateSubscription(ctx context.Context, sub *domain.Subscription) (*domain.Subscription, error) {
	log.Printf("Repository: Creating/updating subscription for user %s: %+v", sub.UserID, sub)
	
	var createdSub domain.Subscription
	query := `
        INSERT INTO subscriptions (user_id, status, current_period_start, current_period_end, auto_renew)
        VALUES ($1::UUID, $2, $3, $4, $5)
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
		log.Printf("Repository: Error creating/updating subscription for user %s: %v", sub.UserID, err)
		return nil, err
	}
	
	log.Printf("Repository: Successfully created/updated subscription for user %s: %+v", sub.UserID, createdSub)
	return &createdSub, nil
}

// GetMonthlyTransferUsage retrieves the count of external transfers for a user in the current month.
func (r *Repository) GetMonthlyTransferUsage(ctx context.Context, userID string) (int, error) {
	// Validate userID
	if userID == "" {
		return 0, errors.New("user ID cannot be empty")
	}

	var count int
	// The 'period' is the first day of the month.
	// DATE_TRUNC('month', NOW()) calculates the first day of the current month.
	query := `
        SELECT external_receipt_count
        FROM monthly_transfer_usage
        WHERE user_id = $1::UUID AND period = DATE_TRUNC('month', NOW())::DATE
    `
	err := r.db.QueryRow(ctx, query, userID).Scan(&count)
	if err != nil {
		// If no row exists for this month, it means usage is 0.
		if err == pgx.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	
	// Ensure count is never negative (data integrity)
	if count < 0 {
		count = 0
	}
	
	return count, nil
}
