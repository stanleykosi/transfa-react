package store

import (
	"testing"
	"time"
)

func TestInferTierStageFromRecords(t *testing.T) {
	now := time.Now().UTC()
	older := now.Add(-5 * time.Minute)

	tests := []struct {
		name    string
		records []onboardingStageRecord
		want    string
	}{
		{
			name:    "no records",
			records: nil,
			want:    "",
		},
		{
			name: "single tier2 active",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "processing", updatedAt: now},
			},
			want: "tier2",
		},
		{
			name: "single tier3 active",
			records: []onboardingStageRecord{
				{stage: "tier3", status: "pending", updatedAt: now},
			},
			want: "tier3",
		},
		{
			name: "both active prefers most recently updated stage",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "processing", updatedAt: older},
				{stage: "tier3", status: "pending", updatedAt: now},
			},
			want: "tier3",
		},
		{
			name: "prefer sole active tier2 when tier3 terminal",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "processing", updatedAt: now},
				{stage: "tier3", status: "completed", updatedAt: older},
			},
			want: "tier2",
		},
		{
			name: "prefer sole active tier3 when tier2 terminal",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "completed", updatedAt: older},
				{stage: "tier3", status: "manual_review", updatedAt: now},
			},
			want: "tier3",
		},
		{
			name: "both terminal prefers most recently updated stage",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "completed", updatedAt: older},
				{stage: "tier3", status: "completed", updatedAt: now},
			},
			want: "tier3",
		},
		{
			name: "same timestamp between tier2 and tier3 prefers tier3",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "processing", updatedAt: now},
				{stage: "tier3", status: "processing", updatedAt: now},
			},
			want: "tier3",
		},
		{
			name: "single terminal tier remains inferable",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "completed", updatedAt: now},
			},
			want: "tier2",
		},
		{
			name: "uses latest status per stage before inferring",
			records: []onboardingStageRecord{
				{stage: "tier2", status: "completed", updatedAt: older},
				{stage: "tier2", status: "processing", updatedAt: now},
			},
			want: "tier2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferTierStageFromRecords(tt.records)
			if got != tt.want {
				t.Fatalf("expected stage %q, got %q", tt.want, got)
			}
		})
	}
}
