package store

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/auth-service/internal/domain"
)

// UserRepository defines the interface for user data storage.
type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) (string, error)
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
        INSERT INTO users (clerk_user_id, username, email, phone_number, user_type, allow_sending)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    `
	var userID string
	err := r.db.QueryRow(ctx, query,
		user.ClerkUserID,
		user.Username,
		user.Email,
		user.PhoneNumber,
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
