/**
 * @description
 * This file implements the data access layer for bank-related operations.
 * It provides caching functionality for bank information to reduce API calls to Anchor.
 *
 * @dependencies
 * - context: For managing request-scoped deadlines and cancellations.
 * - log: For logging database errors.
 * - github.com/jackc/pgx/v5/pgxpool: The PostgreSQL driver.
 * - The service's internal domain package for the Bank model.
 */
package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/account-service/internal/domain"
)

// PostgresBankRepository is the PostgreSQL implementation of the BankRepository.
type PostgresBankRepository struct {
	db *pgxpool.Pool
}

// NewPostgresBankRepository creates a new instance of PostgresBankRepository.
func NewPostgresBankRepository(db *pgxpool.Pool) *PostgresBankRepository {
	return &PostgresBankRepository{db: db}
}

// CacheBanks stores the list of banks in the database for caching.
func (r *PostgresBankRepository) CacheBanks(ctx context.Context, banks []domain.Bank) error {
	// Debug: Log the banks data before marshaling
	log.Printf("DEBUG: Attempting to cache %d banks", len(banks))
	if len(banks) > 0 {
		log.Printf("DEBUG: First bank: %+v", banks[0])
	} else {
		log.Printf("WARNING: No banks to cache - empty array received from Anchor API")
		// Don't cache empty data, but don't return error to avoid breaking the main flow
		return nil
	}
	
	// Serialize banks to JSON with proper encoding
	banksJSON, err := json.Marshal(banks)
	if err != nil {
		return fmt.Errorf("failed to marshal banks: %w", err)
	}
	
	// Debug: Log the JSON being stored (truncated for readability)
	jsonStr := string(banksJSON)
	if len(jsonStr) > 500 {
		log.Printf("DEBUG: JSON to store (truncated): %s...", jsonStr[:500])
	} else {
		log.Printf("DEBUG: JSON to store: %s", jsonStr)
	}
	
	// Validate JSON before storing
	if !json.Valid(banksJSON) {
		log.Printf("ERROR: Generated JSON is invalid: %s", jsonStr)
		return fmt.Errorf("generated JSON is invalid")
	}

	// Delete existing cached banks
	deleteQuery := `DELETE FROM cached_banks`
	_, err = r.db.Exec(ctx, deleteQuery)
	if err != nil {
		log.Printf("Warning: failed to delete existing cached banks: %v", err)
		// Continue with insert - this is not critical
	}

	// Insert new cached banks
	insertQuery := `
		INSERT INTO cached_banks (banks_data, cached_at, expires_at)
		VALUES ($1, $2, $3)
	`
	
	now := time.Now()
	expiresAt := now.Add(24 * time.Hour) // Cache for 24 hours
	
	// Debug: Log the parameters being inserted
	log.Printf("DEBUG: Inserting banks with JSON length: %d, cached_at: %v, expires_at: %v", len(banksJSON), now, expiresAt)
	
	_, err = r.db.Exec(ctx, insertQuery, banksJSON, now, expiresAt)
	if err != nil {
		log.Printf("ERROR: Failed to insert banks into database. JSON length: %d, Error: %v", len(banksJSON), err)
		return fmt.Errorf("failed to cache banks: %w", err)
	}

	log.Printf("Successfully cached %d banks until %v", len(banks), expiresAt)
	return nil
}

// GetCachedBanks retrieves the cached list of banks from the database.
func (r *PostgresBankRepository) GetCachedBanks(ctx context.Context) ([]domain.Bank, error) {
	query := `
		SELECT banks_data, expires_at
		FROM cached_banks
		WHERE expires_at > NOW()
		ORDER BY cached_at DESC
		LIMIT 1
	`
	
	var banksJSON []byte
	var expiresAt time.Time
	
	err := r.db.QueryRow(ctx, query).Scan(&banksJSON, &expiresAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("no valid cached banks found")
		}
		return nil, fmt.Errorf("failed to get cached banks: %w", err)
	}

	// Check if cache is still valid
	if time.Now().After(expiresAt) {
		return nil, fmt.Errorf("cached banks have expired")
	}

	// Deserialize banks from JSON
	var banks []domain.Bank
	err = json.Unmarshal(banksJSON, &banks)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal cached banks: %w", err)
	}

	log.Printf("Retrieved %d cached banks (expires at %v)", len(banks), expiresAt)
	return banks, nil
}

// ClearExpiredBanks removes expired bank cache entries.
func (r *PostgresBankRepository) ClearExpiredBanks(ctx context.Context) error {
	query := `DELETE FROM cached_banks WHERE expires_at <= NOW()`
	
	result, err := r.db.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to clear expired banks: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Cleared %d expired bank cache entries", rowsAffected)
	}
	
	return nil
}
