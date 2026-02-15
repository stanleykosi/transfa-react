package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/transfa/auth-service/internal/domain"
)

type OnboardingProgress struct {
	UserType    string                 `json:"user_type"`
	CurrentStep int                    `json:"current_step"`
	Payload     map[string]interface{} `json:"payload"`
}

type OutboxMessage struct {
	ID         int64
	Exchange   string
	RoutingKey string
	Payload    []byte
	Attempts   int
}

func (r *PostgresUserRepository) CreateUserAndEnqueueUserCreatedEvent(
	ctx context.Context,
	user *domain.User,
	kycData map[string]interface{},
	exchange string,
	routingKey string,
) (string, error) {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO users (clerk_user_id, username, email, phone_number, full_name, user_type, allow_sending)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`
	var userID string
	if err := tx.QueryRow(ctx, query,
		user.ClerkUserID,
		nullableUsername(user.Username),
		user.Email,
		user.PhoneNumber,
		user.FullName,
		user.Type,
		user.AllowSending,
	).Scan(&userID); err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			log.Printf("Error creating user in tx: unique constraint violation on %s", pgErr.ConstraintName)
		}
		return "", err
	}

	event := domain.UserCreatedEvent{
		UserID:  userID,
		KYCData: kycData,
	}
	if err := enqueueEventTx(ctx, tx, exchange, routingKey, event); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return userID, nil
}

func (r *PostgresUserRepository) UpdateUserProfileAndEnqueueUserCreatedEvent(
	ctx context.Context,
	userID string,
	email, phone, fullName *string,
	kycData map[string]interface{},
	exchange string,
	routingKey string,
) error {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := updateContactTx(ctx, tx, userID, email, phone); err != nil {
		return err
	}
	if err := updateAnchorCustomerInfoTx(ctx, tx, userID, "", fullName); err != nil {
		return err
	}

	event := domain.UserCreatedEvent{
		UserID:  userID,
		KYCData: kycData,
	}
	if err := enqueueEventTx(ctx, tx, exchange, routingKey, event); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *PostgresUserRepository) UpsertOnboardingStatusAndEnqueueEvent(
	ctx context.Context,
	userID string,
	stage string,
	status string,
	reason *string,
	exchange string,
	routingKey string,
	payload interface{},
) error {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := upsertOnboardingStatusTx(ctx, tx, userID, stage, status, reason); err != nil {
		return err
	}
	if err := enqueueEventTx(ctx, tx, exchange, routingKey, payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresUserRepository) UpdateTier1ProfileAndEnqueueEvent(
	ctx context.Context,
	userID string,
	email, phone, fullName *string,
	stage string,
	status string,
	reason *string,
	exchange string,
	routingKey string,
	payload interface{},
) error {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := updateContactTx(ctx, tx, userID, email, phone); err != nil {
		return err
	}
	if err := updateAnchorCustomerInfoTx(ctx, tx, userID, "", fullName); err != nil {
		return err
	}
	if err := upsertOnboardingStatusTx(ctx, tx, userID, stage, status, reason); err != nil {
		return err
	}
	if err := enqueueEventTx(ctx, tx, exchange, routingKey, payload); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *PostgresUserRepository) UpsertOnboardingProgress(
	ctx context.Context,
	clerkUserID string,
	userID *string,
	userType string,
	currentStep int,
	payload map[string]interface{},
) error {
	if userType == "" {
		userType = "personal"
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}

	query := `
		INSERT INTO onboarding_progress (clerk_user_id, user_id, user_type, current_step, payload)
		VALUES ($1, $2, $3, $4, $5::jsonb)
		ON CONFLICT (clerk_user_id)
		DO UPDATE SET
			user_id = COALESCE(EXCLUDED.user_id, onboarding_progress.user_id),
			user_type = EXCLUDED.user_type,
			current_step = EXCLUDED.current_step,
			payload = EXCLUDED.payload,
			updated_at = NOW()
	`
	blob, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(
		ctx,
		query,
		strings.TrimSpace(clerkUserID),
		userID,
		strings.ToLower(strings.TrimSpace(userType)),
		currentStep,
		string(blob),
	)
	if err != nil {
		log.Printf("Error upserting onboarding_progress for clerk user %s: %v", clerkUserID, err)
		return err
	}
	return nil
}

func (r *PostgresUserRepository) GetOnboardingProgressByClerkUserID(
	ctx context.Context,
	clerkUserID string,
) (*OnboardingProgress, error) {
	query := `SELECT user_type, current_step, payload FROM onboarding_progress WHERE clerk_user_id = $1 LIMIT 1`

	var (
		userType string
		step     int
		payload  []byte
	)
	err := r.db.QueryRow(ctx, query, strings.TrimSpace(clerkUserID)).Scan(&userType, &step, &payload)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	progress := &OnboardingProgress{
		UserType:    userType,
		CurrentStep: step,
		Payload:     map[string]interface{}{},
	}
	if len(payload) > 0 {
		if unmarshalErr := json.Unmarshal(payload, &progress.Payload); unmarshalErr != nil {
			log.Printf("Warning: failed to unmarshal onboarding_progress payload for clerk user %s: %v", clerkUserID, unmarshalErr)
			progress.Payload = map[string]interface{}{}
		}
	}

	return progress, nil
}

func (r *PostgresUserRepository) ClearOnboardingProgress(ctx context.Context, clerkUserID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM onboarding_progress WHERE clerk_user_id = $1`, strings.TrimSpace(clerkUserID))
	return err
}

func (r *PostgresUserRepository) ClaimOutboxMessages(
	ctx context.Context,
	limit int,
	staleAfterSeconds int,
) ([]OutboxMessage, error) {
	if limit <= 0 {
		limit = 50
	}
	if staleAfterSeconds <= 0 {
		staleAfterSeconds = 120
	}

	query := `
		WITH candidates AS (
			SELECT id
			FROM event_outbox
			WHERE (
				(status = 'pending' AND next_attempt_at <= NOW())
				OR (status = 'processing' AND processing_started_at < NOW() - ($2 * INTERVAL '1 second'))
			)
			ORDER BY created_at
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE event_outbox AS o
		SET status = 'processing',
			processing_started_at = NOW(),
			attempts = o.attempts + 1
		FROM candidates
		WHERE o.id = candidates.id
		RETURNING o.id, o.exchange, o.routing_key, o.payload::text, o.attempts
	`

	rows, err := r.db.Query(ctx, query, limit, staleAfterSeconds)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]OutboxMessage, 0, limit)
	for rows.Next() {
		var (
			msg         OutboxMessage
			payloadText string
		)
		if err := rows.Scan(&msg.ID, &msg.Exchange, &msg.RoutingKey, &payloadText, &msg.Attempts); err != nil {
			return nil, err
		}
		msg.Payload = []byte(payloadText)
		messages = append(messages, msg)
	}
	return messages, rows.Err()
}

func (r *PostgresUserRepository) MarkOutboxPublished(ctx context.Context, id int64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE event_outbox
		SET status = 'published',
			published_at = NOW(),
			processing_started_at = NULL,
			last_error = NULL
		WHERE id = $1
	`, id)
	return err
}

func (r *PostgresUserRepository) MarkOutboxFailed(
	ctx context.Context,
	id int64,
	retryAfterSeconds int,
	reason string,
) error {
	if retryAfterSeconds < 1 {
		retryAfterSeconds = 1
	}
	if len(reason) > 2000 {
		reason = reason[:2000]
	}
	_, err := r.db.Exec(ctx, `
		UPDATE event_outbox
		SET status = 'pending',
			next_attempt_at = NOW() + ($2 * INTERVAL '1 second'),
			processing_started_at = NULL,
			last_error = $3
		WHERE id = $1
	`, id, retryAfterSeconds, reason)
	return err
}

func enqueueEventTx(ctx context.Context, tx pgx.Tx, exchange, routingKey string, payload interface{}) error {
	blob, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO event_outbox (exchange, routing_key, payload)
		VALUES ($1, $2, $3::jsonb)
	`, strings.TrimSpace(exchange), strings.TrimSpace(routingKey), string(blob))
	if err != nil {
		return fmt.Errorf("failed to enqueue outbox event: %w", err)
	}
	return nil
}

func upsertOnboardingStatusTx(ctx context.Context, tx pgx.Tx, userID, stage, status string, reason *string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO onboarding_status (user_id, stage, status, reason)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, stage)
		DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, updated_at = NOW()
	`, userID, stage, status, reason)
	return err
}

func updateContactTx(ctx context.Context, tx pgx.Tx, userID string, email *string, phone *string) error {
	_, err := tx.Exec(ctx, `
		UPDATE users
		SET email = $1, phone_number = $2, updated_at = NOW()
		WHERE id = $3
	`, email, phone, userID)
	return err
}

func updateAnchorCustomerInfoTx(ctx context.Context, tx pgx.Tx, userID string, anchorCustomerID string, fullName *string) error {
	switch {
	case anchorCustomerID != "" && fullName != nil:
		_, err := tx.Exec(ctx, `UPDATE users SET anchor_customer_id = $1, full_name = $2, updated_at = NOW() WHERE id = $3`, anchorCustomerID, fullName, userID)
		return err
	case anchorCustomerID != "":
		_, err := tx.Exec(ctx, `UPDATE users SET anchor_customer_id = $1, updated_at = NOW() WHERE id = $2`, anchorCustomerID, userID)
		return err
	case fullName != nil:
		_, err := tx.Exec(ctx, `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`, fullName, userID)
		return err
	default:
		return nil
	}
}
