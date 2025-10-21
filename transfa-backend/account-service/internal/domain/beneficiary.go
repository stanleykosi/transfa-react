/**
 * @description
 * This file defines the core domain model for a Beneficiary. A beneficiary
 * represents a saved external bank account (an Anchor CounterParty) that a
 * Transfa user can send money to.
 *
 * @notes
 * - This internal model is decoupled from the BaaS provider's representation.
 * - The `UserID` links this beneficiary back to a user in the `users` table.
 */
package domain

import "time"

// Beneficiary represents a user's saved external bank account.
type Beneficiary struct {
	ID                    string    `json:"id"`
	UserID                string    `json:"user_id"`
	AnchorCounterpartyID  string    `json:"anchor_counterparty_id"`
	AccountName           string    `json:"account_name"`
	AccountNumberMasked   string    `json:"account_number_masked"`
	BankName              string    `json:"bank_name"`
	IsDefault             bool      `json:"is_default"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}
