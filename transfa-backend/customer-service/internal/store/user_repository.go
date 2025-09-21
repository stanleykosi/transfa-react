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

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserRepository defines the interface for user data storage operations needed by this service.
type UserRepository interface {
	UpdateAnchorCustomerID(ctx context.Context, userID, anchorCustomerID string) error
	GetAnchorCustomerIDByUserID(ctx context.Context, userID string) (*string, error)
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
	commandTag, err := r.db.Exec(ctx, query, anchorCustomerID, userID)
	if err != nil {
		log.Printf("Error updating anchor_customer_id for user %s: %v", userID, err)
		return err
	}

	if commandTag.RowsAffected() == 0 {
		log.Printf("Warning: No user found with ID %s to update anchor_customer_id", userID)
		// Depending on business logic, this might be considered an error.
		// For now, we log it as a warning.
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
