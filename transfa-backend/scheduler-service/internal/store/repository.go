/**
 * @description
 * Data access layer for scheduler-service (money drop jobs).
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

// HasPendingMoneyDropClaimReconciliationCandidates checks whether there are stale
// pending claim payouts eligible for automatic reconciliation retry.
func (r *Repository) HasPendingMoneyDropClaimReconciliationCandidates(ctx context.Context, olderThan time.Time) (bool, error) {
	if olderThan.IsZero() {
		olderThan = time.Now().UTC().Add(-2 * time.Minute)
	}

	query := `
		SELECT EXISTS (
			SELECT 1
			FROM transactions t
			INNER JOIN accounts src ON src.id = t.source_account_id
			INNER JOIN accounts dest ON dest.id = t.destination_account_id
			WHERE t.type = 'money_drop_claim'
			  AND t.status = 'pending'
			  AND COALESCE(BTRIM(t.anchor_transfer_id), '') = ''
			  AND COALESCE(t.anchor_reason, '') LIKE '%state:reconcile_retry_requested%'
			  AND COALESCE(t.anchor_reason, '') NOT LIKE '%state:transfer_initiated%'
			  AND COALESCE(t.anchor_reason, '') NOT LIKE '%state:reconcile_retry_initiated%'
			  AND COALESCE(t.anchor_reason, '') NOT LIKE '%state:reconcile_retry_inflight%'
			  AND t.destination_account_id IS NOT NULL
			  AND t.updated_at <= $1
			  AND src.anchor_account_id <> ''
			  AND dest.anchor_account_id <> ''
			LIMIT 1
		)
	`

	var hasCandidates bool
	if err := r.db.QueryRow(ctx, query, olderThan).Scan(&hasCandidates); err != nil {
		return false, err
	}
	return hasCandidates, nil
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
