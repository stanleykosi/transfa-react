/**
 * @description
 * This file defines the core domain model for an Account within the Transfa system.
 * It represents the structure of an account as stored in our own database.
 *
 * @notes
 * - This internal model is decoupled from the BaaS provider's representation,
 *   allowing our system to evolve independently.
 * - The `UserID` links this account back to a user in the `users` table.
 */
package domain

import "time"

// AccountType defines the type of a user account.
type AccountType string

const (
	PrimaryAccount   AccountType = "primary"
	MoneyDropAccount AccountType = "money_drop"
)

// Account represents a user's wallet in our system.
type Account struct {
	ID              string      `json:"id"`
	UserID          string      `json:"user_id"`
	AnchorAccountID string      `json:"anchor_account_id"`
	VirtualNUBAN    string      `json:"virtual_nuban"`
	BankName        string      `json:"bank_name"`
	Type            AccountType `json:"account_type"`
	Balance         int64       `json:"balance"` // Stored in kobo
	Status          string      `json:"status"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}
