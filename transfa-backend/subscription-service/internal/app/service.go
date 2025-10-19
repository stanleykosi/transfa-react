/**
 * @description
 * This file contains the core business logic for the subscription service.
 * The Service layer orchestrates data from the repository and applies business rules.
 */
package app

import (
	"context"
	"errors"
	"time"

	"github.com/transfa/subscription-service/internal/domain"
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
	sub, err := s.repo.GetSubscriptionByUserID(ctx, userID)
	if err != nil {
		// If no subscription exists, treat as inactive (free tier)
		if errors.Is(err, errors.New("subscription not found")) { // Assuming repository returns a specific error
			usage, err := s.repo.GetMonthlyTransferUsage(ctx, userID)
			if err != nil {
				return nil, err
			}
			return &domain.SubscriptionStatus{
				Status:             "inactive",
				AutoRenew:          false,
				IsActive:           false,
				TransfersRemaining: 5 - usage,
			}, nil
		}
		return nil, err
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
			return nil, err
		}
		status.TransfersRemaining = 5 - usage
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
