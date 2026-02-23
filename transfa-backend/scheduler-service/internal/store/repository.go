/**
 * @description
 * Data access layer for scheduler-service (money drop jobs).
 */
package store

import (
	"context"

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

// GetExpiredAndCompletedMoneyDrops finds all expired or fully claimed money drops.
func (r *Repository) GetExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error) {
	var drops []domain.MoneyDrop
	query := `
		SELECT id, creator_id, total_amount, amount_per_claim, total_claims_allowed,
		       claims_made_count, funding_source_account_id, money_drop_account_id
		FROM money_drops
		WHERE (status = 'active' AND (expiry_timestamp <= NOW() OR claims_made_count >= total_claims_allowed))
		   OR (
		       status = 'completed'
		       AND ended_reason IN ('refund_retry_pending', 'refund_processing', 'refund_payout_inflight')
		       AND ended_at <= (NOW() - INTERVAL '5 minutes')
		   )
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var drop domain.MoneyDrop
		err := rows.Scan(
			&drop.ID, &drop.CreatorID, &drop.TotalAmount, &drop.AmountPerClaim, &drop.TotalClaimsAllowed,
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
	query := `
		UPDATE money_drops
		SET status = $1,
		    ended_at = COALESCE(ended_at, NOW()),
		    ended_reason = COALESCE(
		        ended_reason,
		        CASE
		            WHEN $1 = 'completed' THEN 'completed'
		            WHEN $1 = 'expired_and_refunded' THEN 'expired'
		            ELSE 'ended'
		        END
		    )
		WHERE id = $2
	`
	_, err := r.db.Exec(ctx, query, status, dropID)
	return err
}
