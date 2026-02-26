package api

import (
	"testing"

	"github.com/transfa/notification-service/internal/domain"
)

func TestNormalizeTierStageLabel(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{input: "TIER_1", want: "tier1"},
		{input: "kyc_tier_2", want: "tier2"},
		{input: "tier3", want: "tier3"},
		{input: " 3 ", want: "tier3"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeTierStageLabel(tt.input)
			if got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestInferTierStageFromEventUsesIncludedVerification(t *testing.T) {
	event := domain.AnchorWebhookEvent{
		Data: domain.EventResource{
			Type:       "customer.identification.approved",
			Attributes: map[string]interface{}{},
		},
		Included: []domain.EventResource{
			{
				Type: "Verification",
				Attributes: map[string]interface{}{
					"level": "TIER_3",
				},
			},
		},
	}

	got := inferTierStageFromEvent(event)
	if got != "tier3" {
		t.Fatalf("expected included verification stage to resolve tier3, got %q", got)
	}
}

func TestInferTierStatusFromAttrs(t *testing.T) {
	attrs := map[string]interface{}{
		"verification": map[string]interface{}{
			"status": "manual_review",
		},
	}

	got := inferTierStatusFromAttrs(attrs)
	if got != "manual_review" {
		t.Fatalf("expected manual_review, got %q", got)
	}
}
