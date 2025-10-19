/**
 * @description
 * This file defines the core domain models for the subscription-service.
 * It includes the main Subscription struct that maps to the database table
 * and any related types or enums.
 */
package domain

import "time"

// Subscription represents the structure of a user's subscription in the database.
type Subscription struct {
	ID                 string    `json:"id"`
	UserID             string    `json:"user_id"` // Keep as string for API compatibility
	Status             string    `json:"status"` // 'active', 'inactive', 'lapsed'
	CurrentPeriodStart time.Time `json:"current_period_start"`
	CurrentPeriodEnd   time.Time `json:"current_period_end"`
	AutoRenew          bool      `json:"auto_renew"`
}

// SubscriptionStatus is a simplified DTO (Data Transfer Object) for API responses
// when a client requests the user's subscription status.
type SubscriptionStatus struct {
	Status             string     `json:"status"`
	CurrentPeriodEnd   *time.Time `json:"current_period_end,omitempty"`
	AutoRenew          bool       `json:"auto_renew"`
	IsActive           bool       `json:"is_active"`
	TransfersRemaining int        `json:"transfers_remaining"` // This will be populated by the service layer
}
