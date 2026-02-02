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
