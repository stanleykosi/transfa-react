package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/transfa/transaction-service/internal/domain"
)

const (
	moneyDropIdempotencyStatusProcessing = "processing"
	moneyDropIdempotencyStatusCompleted  = "completed"
)

func isUndefinedTableError(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42P01"
}

func (r *PostgresRepository) GetMoneyDropPasswordClaimAttemptState(
	ctx context.Context,
	dropID uuid.UUID,
	claimantID uuid.UUID,
) (failedAttempts int, lockedUntil *time.Time, err error) {
	query := `
		SELECT failed_attempts, locked_until
		FROM money_drop_claim_password_attempts
		WHERE drop_id = $1 AND claimant_id = $2
	`
	if err := r.db.QueryRow(ctx, query, dropID, claimantID).Scan(&failedAttempts, &lockedUntil); err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil, nil
		}
		if isUndefinedTableError(err) {
			return 0, nil, nil
		}
		return 0, nil, err
	}
	return failedAttempts, lockedUntil, nil
}

func (r *PostgresRepository) RecordMoneyDropPasswordClaimFailure(
	ctx context.Context,
	dropID uuid.UUID,
	claimantID uuid.UUID,
	maxAttempts int,
	lockoutDuration time.Duration,
) (failedAttempts int, lockedUntil *time.Time, err error) {
	if maxAttempts <= 0 {
		maxAttempts = 5
	}
	lockoutSeconds := int(lockoutDuration.Seconds())
	if lockoutSeconds <= 0 {
		lockoutSeconds = 600
	}

	query := `
		INSERT INTO money_drop_claim_password_attempts (
			drop_id,
			claimant_id,
			failed_attempts,
			last_failed_at,
			locked_until,
			updated_at
		)
		VALUES (
			$1,
			$2,
			1,
			NOW(),
			CASE WHEN $3 <= 1 THEN NOW() + ($4 * INTERVAL '1 second') ELSE NULL END,
			NOW()
		)
		ON CONFLICT (drop_id, claimant_id)
		DO UPDATE SET
			failed_attempts = CASE
				WHEN money_drop_claim_password_attempts.locked_until IS NOT NULL
					AND money_drop_claim_password_attempts.locked_until <= NOW() THEN 1
				ELSE money_drop_claim_password_attempts.failed_attempts + 1
			END,
			last_failed_at = NOW(),
			locked_until = CASE
				WHEN (
					CASE
						WHEN money_drop_claim_password_attempts.locked_until IS NOT NULL
							AND money_drop_claim_password_attempts.locked_until <= NOW() THEN 1
						ELSE money_drop_claim_password_attempts.failed_attempts + 1
					END
				) >= $3 THEN NOW() + ($4 * INTERVAL '1 second')
				ELSE NULL
			END,
			updated_at = NOW()
		RETURNING failed_attempts, locked_until
	`

	if err := r.db.QueryRow(ctx, query, dropID, claimantID, maxAttempts, lockoutSeconds).Scan(&failedAttempts, &lockedUntil); err != nil {
		if isUndefinedTableError(err) {
			return 1, nil, nil
		}
		return 0, nil, err
	}
	return failedAttempts, lockedUntil, nil
}

func (r *PostgresRepository) ResetMoneyDropPasswordClaimFailures(
	ctx context.Context,
	dropID uuid.UUID,
	claimantID uuid.UUID,
) error {
	query := `
		DELETE FROM money_drop_claim_password_attempts
		WHERE drop_id = $1 AND claimant_id = $2
	`
	_, err := r.db.Exec(ctx, query, dropID, claimantID)
	if isUndefinedTableError(err) {
		return nil
	}
	return err
}

func (r *PostgresRepository) AcquireMoneyDropClaimIdempotency(
	ctx context.Context,
	dropID uuid.UUID,
	claimantID uuid.UUID,
	key string,
	requestHash string,
	ttl time.Duration,
	staleWindow time.Duration,
) (cachedResponse *domain.ClaimMoneyDropResponse, acquired bool, err error) {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	if staleWindow <= 0 {
		staleWindow = 2 * time.Minute
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		if isUndefinedTableError(err) {
			return nil, true, nil
		}
		return nil, false, fmt.Errorf("begin idempotency tx: %w", err)
	}
	defer tx.Rollback(ctx)

	expiresAt := time.Now().UTC().Add(ttl)
	insertQuery := `
		INSERT INTO money_drop_claim_idempotency (
			drop_id,
			claimant_id,
			idempotency_key,
			request_hash,
			status,
			expires_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (claimant_id, idempotency_key) DO NOTHING
	`
	insertResult, err := tx.Exec(
		ctx,
		insertQuery,
		dropID,
		claimantID,
		key,
		requestHash,
		moneyDropIdempotencyStatusProcessing,
		expiresAt,
	)
	if err != nil {
		if isUndefinedTableError(err) {
			return nil, true, nil
		}
		return nil, false, fmt.Errorf("reserve idempotency key: %w", err)
	}
	if insertResult.RowsAffected() == 1 {
		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return nil, true, nil
	}

	var (
		existingDropID  uuid.UUID
		existingHash    string
		status          string
		responsePayload []byte
		updatedAt       time.Time
		existingExpires time.Time
	)
	selectQuery := `
		SELECT drop_id, request_hash, status, response_payload, updated_at, expires_at
		FROM money_drop_claim_idempotency
		WHERE claimant_id = $1 AND idempotency_key = $2
		FOR UPDATE
	`
	if err := tx.QueryRow(ctx, selectQuery, claimantID, key).Scan(
		&existingDropID,
		&existingHash,
		&status,
		&responsePayload,
		&updatedAt,
		&existingExpires,
	); err != nil {
		if isUndefinedTableError(err) {
			return nil, true, nil
		}
		if err == pgx.ErrNoRows {
			return nil, false, ErrMoneyDropClaimIdempotencyInProgress
		}
		return nil, false, fmt.Errorf("load idempotency row: %w", err)
	}

	if existingDropID != dropID || existingHash != requestHash {
		return nil, false, ErrMoneyDropClaimIdempotencyConflict
	}

	now := time.Now().UTC()
	if status == moneyDropIdempotencyStatusCompleted {
		if len(responsePayload) == 0 {
			return nil, false, ErrMoneyDropClaimIdempotencyInProgress
		}
		var response domain.ClaimMoneyDropResponse
		if err := json.Unmarshal(responsePayload, &response); err != nil {
			return nil, false, fmt.Errorf("decode idempotent response payload: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return &response, false, nil
	}

	isStale := updatedAt.Before(now.Add(-staleWindow)) || existingExpires.Before(now)
	if !isStale {
		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return nil, false, ErrMoneyDropClaimIdempotencyInProgress
	}

	reclaimQuery := `
		UPDATE money_drop_claim_idempotency
		SET
			drop_id = $3,
			request_hash = $4,
			status = $5,
			response_payload = NULL,
			claim_transaction_id = NULL,
			expires_at = $6,
			updated_at = NOW()
		WHERE claimant_id = $1 AND idempotency_key = $2
	`
	if _, err := tx.Exec(
		ctx,
		reclaimQuery,
		claimantID,
		key,
		dropID,
		requestHash,
		moneyDropIdempotencyStatusProcessing,
		expiresAt,
	); err != nil {
		if isUndefinedTableError(err) {
			return nil, true, nil
		}
		return nil, false, fmt.Errorf("reclaim stale idempotency row: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return nil, true, nil
}

func (r *PostgresRepository) CompleteMoneyDropClaimIdempotency(
	ctx context.Context,
	dropID uuid.UUID,
	claimantID uuid.UUID,
	key string,
	claimTransactionID uuid.UUID,
	response domain.ClaimMoneyDropResponse,
) error {
	responsePayload, err := json.Marshal(response)
	if err != nil {
		return fmt.Errorf("marshal idempotent response payload: %w", err)
	}

	query := `
		UPDATE money_drop_claim_idempotency
		SET
			status = $5,
			response_payload = $4::jsonb,
			claim_transaction_id = $6,
			updated_at = NOW()
		WHERE drop_id = $1 AND claimant_id = $2 AND idempotency_key = $3
	`
	result, err := r.db.Exec(
		ctx,
		query,
		dropID,
		claimantID,
		key,
		string(responsePayload),
		moneyDropIdempotencyStatusCompleted,
		claimTransactionID,
	)
	if err != nil {
		if isUndefinedTableError(err) {
			return nil
		}
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrMoneyDropClaimIdempotencyInProgress
	}
	return nil
}

func (r *PostgresRepository) ReleaseMoneyDropClaimIdempotency(
	ctx context.Context,
	dropID uuid.UUID,
	claimantID uuid.UUID,
	key string,
) error {
	query := `
		DELETE FROM money_drop_claim_idempotency
		WHERE drop_id = $1
		  AND claimant_id = $2
		  AND idempotency_key = $3
		  AND status = $4
	`
	_, err := r.db.Exec(ctx, query, dropID, claimantID, key, moneyDropIdempotencyStatusProcessing)
	if isUndefinedTableError(err) {
		return nil
	}
	return err
}
