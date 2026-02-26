/**
 * @description
 * This file implements the data access layer for user-related operations in the database.
 * It provides a clean, abstracted interface for the application logic to interact with
 * the `users` table without needing to know the underlying SQL queries.
 *
 * @dependencies
 * - context: For managing request-scoped deadlines and cancellations.
 * - log: For logging database errors.
 * - github.com/jackc/pgx/v5/pgxpool: The PostgreSQL driver and connection pool manager.
 *
 * @notes
 * - This implementation follows the repository pattern, separating data access concerns
 *   from the core business logic in the `app` layer.
 */
package store

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserRepository defines the interface for user data storage operations needed by this service.
type UserRepository interface {
	UpdateAnchorCustomerID(ctx context.Context, userID, anchorCustomerID string) error
	UpdateAnchorCustomerInfo(ctx context.Context, userID string, anchorCustomerID string, fullName *string) error
	GetAnchorCustomerIDByUserID(ctx context.Context, userID string) (*string, error)
	FindUserIDByAnchorCustomerID(ctx context.Context, anchorCustomerID string) (string, error)
	EnsureOnboardingStatusTable(ctx context.Context) error
	UpsertOnboardingStatus(ctx context.Context, userID, stage, status string, reason *string) error
	InferTierStageFromOnboarding(ctx context.Context, userID string) (string, error)
	UserHasAccount(ctx context.Context, userID string) (bool, error)
}

type onboardingStageRecord struct {
	stage     string
	status    string
	updatedAt time.Time
}

func isActiveTierStatus(status string) bool {
	normalizedStatus := strings.ToLower(strings.TrimSpace(status))
	return normalizedStatus == "pending" ||
		normalizedStatus == "processing" ||
		normalizedStatus == "manual_review" ||
		normalizedStatus == "awaiting_document" ||
		normalizedStatus == "reenter_information"
}

func inferTierStageFromRecords(records []onboardingStageRecord) string {
	if len(records) == 0 {
		return ""
	}

	latestByStage := map[string]onboardingStageRecord{}
	for _, rec := range records {
		if rec.stage != "tier2" && rec.stage != "tier3" {
			continue
		}

		existing, ok := latestByStage[rec.stage]
		if !ok || rec.updatedAt.After(existing.updatedAt) {
			latestByStage[rec.stage] = rec
		}
	}

	tier2, hasTier2 := latestByStage["tier2"]
	tier3, hasTier3 := latestByStage["tier3"]
	if !hasTier2 && !hasTier3 {
		return ""
	}
	if hasTier2 && !hasTier3 {
		return "tier2"
	}
	if hasTier3 && !hasTier2 {
		return "tier3"
	}

	tier2Active := hasTier2 && isActiveTierStatus(tier2.status)
	tier3Active := hasTier3 && isActiveTierStatus(tier3.status)
	switch {
	case tier2Active && !tier3Active:
		return "tier2"
	case tier3Active && !tier2Active:
		return "tier3"
	case tier2Active && tier3Active:
		// Both tiers are active. Favor the freshest stage to keep status updates flowing.
		return pickLatestTierStage(tier2, tier3)
	}

	// Both tiers are terminal. Favor the freshest stage for deterministic routing.
	return pickLatestTierStage(tier2, tier3)
}

func pickLatestTierStage(tier2 onboardingStageRecord, tier3 onboardingStageRecord) string {
	switch {
	case tier3.updatedAt.After(tier2.updatedAt):
		return "tier3"
	case tier2.updatedAt.After(tier3.updatedAt):
		return "tier2"
	default:
		// Same timestamp is rare; prefer higher tier to avoid down-level routing.
		return "tier3"
	}
}

// PostgresUserRepository is the PostgreSQL implementation of the UserRepository.
type PostgresUserRepository struct {
	db *pgxpool.Pool
}

// NewPostgresUserRepository creates a new instance of PostgresUserRepository.
func NewPostgresUserRepository(db *pgxpool.Pool) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

// UpdateAnchorCustomerID updates the `anchor_customer_id` for a given user in the database.
// This is a critical step after a customer has been successfully created on the Anchor platform.
func (r *PostgresUserRepository) UpdateAnchorCustomerID(ctx context.Context, userID, anchorCustomerID string) error {
	query := `
        UPDATE users
        SET anchor_customer_id = $1, updated_at = NOW()
        WHERE id = $2
    `
	commandTag, err := r.db.Exec(ctx, query, nullIfEmpty(anchorCustomerID), userID)
	if err != nil {
		log.Printf("Error updating anchor_customer_id for user %s: %v", userID, err)
		return err
	}

	if commandTag.RowsAffected() == 0 {
		log.Printf("Warning: No user found with ID %s to update anchor_customer_id", userID)
	}

	return nil
}

// UpdateAnchorCustomerInfo updates the anchor customer ID and full name for a user.
func (r *PostgresUserRepository) UpdateAnchorCustomerInfo(ctx context.Context, userID string, anchorCustomerID string, fullName *string) error {
	var (
		query string
		args  []interface{}
	)

	switch {
	case anchorCustomerID != "" && fullName != nil:
		query = `UPDATE users SET anchor_customer_id = $1, full_name = $2, updated_at = NOW() WHERE id = $3`
		args = []interface{}{anchorCustomerID, fullName, userID}
	case anchorCustomerID != "" && fullName == nil:
		query = `UPDATE users SET anchor_customer_id = $1, updated_at = NOW() WHERE id = $2`
		args = []interface{}{anchorCustomerID, userID}
	case anchorCustomerID == "" && fullName != nil:
		query = `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`
		args = []interface{}{fullName, userID}
	default:
		return nil
	}

	commandTag, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		log.Printf("Error updating anchor customer info for user %s: %v", userID, err)
		return err
	}

	if commandTag.RowsAffected() == 0 {
		log.Printf("Warning: No user found with ID %s to update anchor customer info", userID)
	}

	return nil
}

// GetAnchorCustomerIDByUserID returns the anchor_customer_id if present for a user.
func (r *PostgresUserRepository) GetAnchorCustomerIDByUserID(ctx context.Context, userID string) (*string, error) {
	query := `
		SELECT anchor_customer_id FROM users WHERE id = $1 LIMIT 1
	`
	var anchorID *string
	row := r.db.QueryRow(ctx, query, userID)
	if err := row.Scan(&anchorID); err != nil {
		if err == pgx.ErrNoRows {
			return nil, err
		}
		log.Printf("Error fetching anchor_customer_id for user %s: %v", userID, err)
		return nil, err
	}
	return anchorID, nil
}

func (r *PostgresUserRepository) FindUserIDByAnchorCustomerID(ctx context.Context, anchorCustomerID string) (string, error) {
	query := `
		SELECT id FROM users WHERE anchor_customer_id = $1 LIMIT 1
	`
	var userID string
	row := r.db.QueryRow(ctx, query, anchorCustomerID)
	if err := row.Scan(&userID); err != nil {
		if err == pgx.ErrNoRows {
			return "", err
		}
		log.Printf("Error fetching user id by anchor_customer_id %s: %v", anchorCustomerID, err)
		return "", err
	}
	return userID, nil
}

// EnsureOnboardingStatusTable creates the onboarding_status table if it doesn't exist.
func (r *PostgresUserRepository) EnsureOnboardingStatusTable(ctx context.Context) error {
	query := `
        CREATE TABLE IF NOT EXISTS onboarding_status (
            user_id UUID NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, stage)
        )
    `
	_, err := r.db.Exec(ctx, query)
	if err != nil {
		log.Printf("Error ensuring onboarding_status table: %v", err)
		return err
	}
	return nil
}

// UpsertOnboardingStatus writes or updates the onboarding status for a user and stage.
func (r *PostgresUserRepository) UpsertOnboardingStatus(ctx context.Context, userID, stage, status string, reason *string) error {
	query := `
        INSERT INTO onboarding_status (user_id, stage, status, reason)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, stage)
        DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, updated_at = NOW()
    `
	_, err := r.db.Exec(ctx, query, userID, stage, status, reason)
	if err != nil {
		log.Printf("Error upserting onboarding status for user %s: %v", userID, err)
		return err
	}
	return nil
}

// InferTierStageFromOnboarding infers whether an incoming stage-less identification update
// belongs to tier2 or tier3 by inspecting current onboarding states.
func (r *PostgresUserRepository) InferTierStageFromOnboarding(ctx context.Context, userID string) (string, error) {
	query := `
		SELECT stage, status, updated_at
		FROM onboarding_status
		WHERE user_id = $1
		  AND stage IN ('tier2', 'tier3')
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		log.Printf("Error inferring tier stage for user %s: %v", userID, err)
		return "", err
	}
	defer rows.Close()

	records := make([]onboardingStageRecord, 0, 2)
	for rows.Next() {
		var rec onboardingStageRecord
		if err := rows.Scan(&rec.stage, &rec.status, &rec.updatedAt); err != nil {
			log.Printf("Error scanning onboarding stage for user %s: %v", userID, err)
			return "", err
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		log.Printf("Error iterating onboarding stages for user %s: %v", userID, err)
		return "", err
	}
	if len(records) == 0 {
		return "", nil
	}

	return inferTierStageFromRecords(records), nil
}

// UserHasAccount checks whether the user already has a deposit account.
func (r *PostgresUserRepository) UserHasAccount(ctx context.Context, userID string) (bool, error) {
	query := `SELECT EXISTS (SELECT 1 FROM accounts WHERE user_id = $1)`
	var exists bool
	if err := r.db.QueryRow(ctx, query, userID).Scan(&exists); err != nil {
		log.Printf("Error checking account existence for user %s: %v", userID, err)
		return false, err
	}
	return exists, nil
}

func nullIfEmpty(val string) interface{} {
	if val == "" {
		return nil
	}
	return val
}
