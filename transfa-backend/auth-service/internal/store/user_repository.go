package store

import (
	"context"
	"errors"
	"log"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/auth-service/internal/domain"
)

// UserRepository defines the interface for user data storage.
type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) (string, error)
	CreateUserAndEnqueueUserCreatedEvent(ctx context.Context, user *domain.User, kycData map[string]interface{}, exchange, routingKey string) (string, error)
	FindByClerkUserID(ctx context.Context, clerkUserID string) (*domain.User, error)
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	UpdateClerkUserID(ctx context.Context, userID, clerkUserID string) error
	UpdateContactInfo(ctx context.Context, userID string, email *string, phone *string) error
	UpdateAnchorCustomerInfo(ctx context.Context, userID string, anchorCustomerID string, fullName *string) error
	UpdateUserProfileAndEnqueueUserCreatedEvent(ctx context.Context, userID string, email, phone, fullName *string, kycData map[string]interface{}, exchange, routingKey string) error
	UpsertOnboardingStatus(ctx context.Context, userID, stage, status string, reason *string) error
	UpsertOnboardingStatusAndEnqueueEvent(ctx context.Context, userID, stage, status string, reason *string, exchange, routingKey string, payload interface{}) error
	UpdateTier1ProfileAndEnqueueEvent(ctx context.Context, userID string, email, phone, fullName *string, stage, status string, reason *string, exchange, routingKey string, payload interface{}) error
	UpsertOnboardingProgress(ctx context.Context, clerkUserID string, userID *string, userType string, currentStep int, payload map[string]interface{}) error
	GetOnboardingProgressByClerkUserID(ctx context.Context, clerkUserID string) (*OnboardingProgress, error)
	ClearOnboardingProgress(ctx context.Context, clerkUserID string) error
	ClaimOutboxMessages(ctx context.Context, limit int, staleAfterSeconds int) ([]OutboxMessage, error)
	MarkOutboxPublished(ctx context.Context, id int64) error
	MarkOutboxFailed(ctx context.Context, id int64, retryAfterSeconds int, reason string) error
}

// PostgresUserRepository is the PostgreSQL implementation of the UserRepository.
type PostgresUserRepository struct {
	db *pgxpool.Pool
}

// NewPostgresUserRepository creates a new instance of PostgresUserRepository.
func NewPostgresUserRepository(db *pgxpool.Pool) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

// CreateUser inserts a new user record into the database.
// It returns the new user's internal UUID or an error.
func (r *PostgresUserRepository) CreateUser(ctx context.Context, user *domain.User) (string, error) {
	query := `
        INSERT INTO users (clerk_user_id, username, email, phone_number, full_name, user_type, allow_sending)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `
	var userID string
	err := r.db.QueryRow(ctx, query,
		user.ClerkUserID,
		nullableUsername(user.Username),
		user.Email,
		user.PhoneNumber,
		user.FullName,
		user.Type,
		user.AllowSending,
	).Scan(&userID)

	if err != nil {
		// Check for unique constraint violation
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			log.Printf("Error creating user: unique constraint violation on field %s", pgErr.ConstraintName)
			return "", err // Let handler return a 409 Conflict
		}
		log.Printf("Error inserting user into database: %v", err)
		return "", err
	}

	log.Printf("Successfully created user with ID: %s", userID)
	return userID, nil
}

// FindByClerkUserID retrieves a user by their Clerk User ID.
func (r *PostgresUserRepository) FindByClerkUserID(ctx context.Context, clerkUserID string) (*domain.User, error) {
	query := `
		SELECT id, clerk_user_id, anchor_customer_id, btrim(username) AS username, email, phone_number, full_name, user_type, allow_sending, created_at, updated_at
		FROM users WHERE clerk_user_id = $1 LIMIT 1
	`
	var u domain.User
	var anchorID *string
	var username *string
	row := r.db.QueryRow(ctx, query, clerkUserID)
	err := row.Scan(
		&u.ID,
		&u.ClerkUserID,
		&anchorID,
		&username,
		&u.Email,
		&u.PhoneNumber,
		&u.FullName,
		&u.Type,
		&u.AllowSending,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		log.Printf("Error fetching user by clerk_user_id %s: %v", clerkUserID, err)
		return nil, err
	}
	if anchorID != nil {
		u.AnchorCustomerID = anchorID
	}
	u.Username = username
	return &u, nil
}

// FindByEmail retrieves a user by their email address.
func (r *PostgresUserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT id, clerk_user_id, anchor_customer_id, btrim(username) AS username, email, phone_number, full_name, user_type, allow_sending, created_at, updated_at
		FROM users WHERE email = $1 LIMIT 1
	`
	var u domain.User
	var anchorID *string
	var username *string
	row := r.db.QueryRow(ctx, query, email)
	err := row.Scan(
		&u.ID,
		&u.ClerkUserID,
		&anchorID,
		&username,
		&u.Email,
		&u.PhoneNumber,
		&u.FullName,
		&u.Type,
		&u.AllowSending,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		log.Printf("Error fetching user by email %s: %v", email, err)
		return nil, err
	}
	if anchorID != nil {
		u.AnchorCustomerID = anchorID
	}
	u.Username = username
	return &u, nil
}

// UpdateClerkUserID updates the Clerk user ID for a given internal user ID.
func (r *PostgresUserRepository) UpdateClerkUserID(ctx context.Context, userID, clerkUserID string) error {
	query := `
		UPDATE users
		SET clerk_user_id = $1, updated_at = NOW()
		WHERE id = $2
	`
	_, err := r.db.Exec(ctx, query, clerkUserID, userID)
	if err != nil {
		log.Printf("Error updating clerk_user_id for user %s: %v", userID, err)
		return err
	}
	return nil
}

// UpdateContactInfo updates tier 1 profile contact fields for a user.
func (r *PostgresUserRepository) UpdateContactInfo(ctx context.Context, userID string, email *string, phone *string) error {
	query := `
		UPDATE users
		SET email = $1, phone_number = $2, updated_at = NOW()
		WHERE id = $3
	`
	_, err := r.db.Exec(ctx, query, email, phone, userID)
	if err != nil {
		log.Printf("Error updating contact info for user %s: %v", userID, err)
		return err
	}
	return nil
}

// UpdateAnchorCustomerInfo updates the anchor customer ID and full name for a user.
func (r *PostgresUserRepository) UpdateAnchorCustomerInfo(ctx context.Context, userID string, anchorCustomerID string, fullName *string) error {
	var query string
	var args []interface{}

	if anchorCustomerID != "" && fullName != nil {
		// Update both anchor customer ID and full name
		query = `UPDATE users SET anchor_customer_id = $1, full_name = $2, updated_at = NOW() WHERE id = $3`
		args = []interface{}{anchorCustomerID, fullName, userID}
	} else if anchorCustomerID != "" {
		// Update only anchor customer ID
		query = `UPDATE users SET anchor_customer_id = $1, updated_at = NOW() WHERE id = $2`
		args = []interface{}{anchorCustomerID, userID}
	} else if fullName != nil {
		// Update only full name
		query = `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`
		args = []interface{}{fullName, userID}
	} else {
		// Nothing to update
		return nil
	}

	_, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		log.Printf("Error updating anchor customer info for user %s: %v", userID, err)
		return err
	}
	return nil
}

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

func nullableUsername(username *string) interface{} {
	if username == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*username)
	if trimmed == "" {
		return nil
	}
	return trimmed
}
