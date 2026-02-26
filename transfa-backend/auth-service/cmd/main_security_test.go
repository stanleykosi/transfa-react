package main

import (
	"context"
	"testing"

	api "github.com/transfa/auth-service/internal/api"
)

func int64Ptr(value int64) *int64 {
	return &value
}

func TestRequireFreshPinChangeReverification(t *testing.T) {
	t.Run("rejects when freshness metadata is missing and fallback is disabled", func(t *testing.T) {
		err := requireFreshPinChangeReverification(context.Background(), 600, false)
		if err == nil {
			t.Fatalf("expected error when reverification metadata is missing")
		}
	})

	t.Run("allows when freshness metadata is missing and insecure fallback is enabled", func(t *testing.T) {
		err := requireFreshPinChangeReverification(context.Background(), 600, true)
		if err != nil {
			t.Fatalf("expected success with insecure fallback enabled, got %v", err)
		}
	})

	t.Run("allows when first factor verification age is within threshold", func(t *testing.T) {
		ctx := api.WithClerkSessionSecurity(context.Background(), &api.ClerkSessionSecurity{
			FirstFactorAgeMinutes: int64Ptr(4),
		})
		err := requireFreshPinChangeReverification(ctx, 600, false)
		if err != nil {
			t.Fatalf("expected success for fresh first factor age, got %v", err)
		}
	})

	t.Run("allows when second factor verification age is within threshold", func(t *testing.T) {
		ctx := api.WithClerkSessionSecurity(context.Background(), &api.ClerkSessionSecurity{
			SecondFactorAgeMinutes: int64Ptr(5),
		})
		err := requireFreshPinChangeReverification(ctx, 600, false)
		if err != nil {
			t.Fatalf("expected success for fresh second factor age, got %v", err)
		}
	})

	t.Run("rejects when factor verification ages are older than threshold", func(t *testing.T) {
		ctx := api.WithClerkSessionSecurity(context.Background(), &api.ClerkSessionSecurity{
			FirstFactorAgeMinutes:  int64Ptr(20),
			SecondFactorAgeMinutes: int64Ptr(20),
		})
		err := requireFreshPinChangeReverification(ctx, 600, false)
		if err == nil {
			t.Fatalf("expected error for stale factor verification ages")
		}
	})
}

func TestDetermineCurrentKYCTier(t *testing.T) {
	tests := []struct {
		name           string
		stageStatus    map[string]map[string]any
		hasTier2Record bool
		hasAccount     bool
		wantTier       int
	}{
		{
			name: "tier3 approved maps to tier 3",
			stageStatus: map[string]map[string]any{
				"tier3": {"status": "approved"},
				"tier2": {"status": "completed"},
			},
			hasTier2Record: true,
			wantTier:       3,
		},
		{
			name: "tier2 completed maps to tier 2",
			stageStatus: map[string]map[string]any{
				"tier2": {"status": "completed"},
				"tier3": {"status": "pending"},
			},
			hasTier2Record: true,
			wantTier:       2,
		},
		{
			name: "tier2 rejected does not promote tier despite account",
			stageStatus: map[string]map[string]any{
				"tier2": {"status": "rejected"},
				"tier3": {"status": "pending"},
			},
			hasTier2Record: true,
			hasAccount:     true,
			wantTier:       1,
		},
		{
			name: "legacy account fallback promotes to tier 2 only when no tier2 record exists",
			stageStatus: map[string]map[string]any{
				"tier1": {"status": "completed"},
				"tier3": {"status": "pending"},
			},
			hasTier2Record: false,
			hasAccount:     true,
			wantTier:       2,
		},
		{
			name: "no qualifying status remains tier 1",
			stageStatus: map[string]map[string]any{
				"tier2": {"status": "pending"},
				"tier3": {"status": "pending"},
			},
			hasTier2Record: true,
			wantTier:       1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := determineCurrentKYCTier(tt.stageStatus, tt.hasTier2Record, tt.hasAccount)
			if got != tt.wantTier {
				t.Fatalf("expected tier %d, got %d", tt.wantTier, got)
			}
		})
	}
}
