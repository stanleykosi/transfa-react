/**
 * @description
 * This file contains the core business logic for the subscription service.
 * The Service layer orchestrates data from the repository and applies business rules.
 */
package app

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/transfa/subscription-service/internal/domain"
	"github.com/transfa/subscription-service/internal/store"
)

// Repository defines the interface for database operations that the service needs.
type Repository interface {
	GetSubscriptionByUserID(ctx context.Context, userID string) (*domain.Subscription, error)
	CreateOrUpdateSubscription(ctx context.Context, sub *domain.Subscription) (*domain.Subscription, error)
	GetMonthlyTransferUsage(ctx context.Context, userID string) (int, error)
}

// Service provides the business logic for subscription management.
type Service struct {
	repo Repository
}

// NewService creates a new subscription service.
func NewService(repo Repository) Service {
	return Service{repo: repo}
}

// GetStatus retrieves the subscription status for a user, including remaining free transfers.
func (s Service) GetStatus(ctx context.Context, userID string) (*domain.SubscriptionStatus, error) {
	// Validate userID
	if userID == "" {
		return nil, errors.New("user ID cannot be empty")
	}

	sub, err := s.repo.GetSubscriptionByUserID(ctx, userID)
	if err != nil {
		// If no subscription exists, create a free tier subscription record
		if errors.Is(err, store.ErrSubscriptionNotFound) {
			// Create a free tier subscription record for the user
			freeTierSub := &domain.Subscription{
				UserID:             userID,
				Status:             "inactive",
				CurrentPeriodStart: time.Now(),
				CurrentPeriodEnd:   time.Now().AddDate(0, 1, 0), // 1 month from now
				AutoRenew:          true, // Database defaults to true
			}
			
			createdSub, createErr := s.repo.CreateOrUpdateSubscription(ctx, freeTierSub)
			if createErr != nil {
				// If creation fails, fall back to in-memory response
				log.Printf("WARN: Failed to create free tier subscription for user %s: %v", userID, createErr)
				usage, err := s.repo.GetMonthlyTransferUsage(ctx, userID)
				if err != nil {
					usage = 0
				}
				
				transfersRemaining := 5 - usage
				if transfersRemaining < 0 {
					transfersRemaining = 0
				}
				
				return &domain.SubscriptionStatus{
					Status:             "inactive",
					AutoRenew:          false,
					IsActive:           false,
					TransfersRemaining: transfersRemaining,
				}, nil
			}
			
			// Use the created subscription
			sub = createdSub
		} else {
			return nil, err
		}
	}

	status := &domain.SubscriptionStatus{
		Status:    sub.Status,
		AutoRenew: sub.AutoRenew,
		IsActive:  sub.Status == "active" && sub.CurrentPeriodEnd.After(time.Now()),
	}

	if status.IsActive {
		status.CurrentPeriodEnd = &sub.CurrentPeriodEnd
		// Subscribers have "unlimited" transfers, represented here as -1
		status.TransfersRemaining = -1
	} else {
		// Non-active subscribers are on the free tier
		usage, err := s.repo.GetMonthlyTransferUsage(ctx, userID)
		if err != nil {
			// If usage query fails, assume 0 usage
			usage = 0
		}
		
		// Handle edge case: usage > 5 (over-limit scenario)
		transfersRemaining := 5 - usage
		if transfersRemaining < 0 {
			transfersRemaining = 0 // Cap at 0, don't go negative
		}
		status.TransfersRemaining = transfersRemaining
	}

	return status, nil
}

// Upgrade activates or extends a user's subscription for one month.
func (s Service) Upgrade(ctx context.Context, userID string) (*domain.Subscription, error) {
	now := time.Now()
	// Calculate the end of the new billing period (1 month from now)
	periodEnd := now.AddDate(0, 1, 0)

	// Create or update subscription record
	sub := &domain.Subscription{
		UserID:             userID,
		Status:             "active",
		CurrentPeriodStart: now,
		CurrentPeriodEnd:   periodEnd,
		AutoRenew:          true,
	}

	return s.repo.CreateOrUpdateSubscription(ctx, sub)
}

// Cancel stops the subscription from auto-renewing at the end of the current period.
func (s Service) Cancel(ctx context.Context, userID string) (*domain.Subscription, error) {
	sub, err := s.repo.GetSubscriptionByUserID(ctx, userID)
	if err != nil {
		return nil, err // Can't cancel a non-existent subscription
	}

	sub.AutoRenew = false
	return s.repo.CreateOrUpdateSubscription(ctx, sub)
}

// SetAutoRenew toggles the auto-renewal setting for a user's subscription.
func (s Service) SetAutoRenew(ctx context.Context, userID string, autoRenew bool) (*domain.Subscription, error) {
	sub, err := s.repo.GetSubscriptionByUserID(ctx, userID)
	if err != nil {
		return nil, err // Can't modify a non-existent subscription
	}

	sub.AutoRenew = autoRenew
	return s.repo.CreateOrUpdateSubscription(ctx, sub)
}
