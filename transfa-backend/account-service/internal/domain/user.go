/**
 * @description
 * This file defines domain models related to a User, specifically those needed
 * by the account-service, such as subscription status.
 */
package domain

// SubscriptionStatus represents the user's subscription state.
type SubscriptionStatus string

const (
	SubscriptionStatusActive   SubscriptionStatus = "active"
	SubscriptionStatusInactive SubscriptionStatus = "inactive"
	SubscriptionStatusLapsed   SubscriptionStatus = "lapsed"
)

// UserSubscriptionInfo holds information about a user's subscription status.
type UserSubscriptionInfo struct {
	Status SubscriptionStatus `json:"status"`
}
