package app

import "testing"

func TestNormalizeTierStage(t *testing.T) {
	tests := []struct {
		name   string
		stage  string
		status string
		want   string
	}{
		{
			name:  "uses explicit stage value",
			stage: "tier2",
			want:  "tier2",
		},
		{
			name:   "derives stage from tier2 status prefix",
			status: "tier2_completed",
			want:   "tier2",
		},
		{
			name:   "derives stage from kyc tier3 prefix",
			status: "KYC_TIER_3_APPROVED",
			want:   "tier3",
		},
		{
			name:   "derives stage from tier1 underscore status prefix",
			status: "tier_1_created",
			want:   "tier1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeTierStage(tt.stage, tt.status)
			if got != tt.want {
				t.Fatalf("expected stage %q, got %q", tt.want, got)
			}
		})
	}
}

func TestNormalizeTierStatus(t *testing.T) {
	tests := []struct {
		name   string
		status string
		want   string
	}{
		{
			name:   "normalizes tier2 prefixed status",
			status: "tier2_completed",
			want:   "completed",
		},
		{
			name:   "normalizes kyc tier3 prefixed status",
			status: "KYC_TIER_3_AWAITING_DOCUMENT",
			want:   "awaiting_document",
		},
		{
			name:   "normalizes manual review camel case",
			status: "manualReview",
			want:   "manual_review",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeTierStatus(tt.status)
			if got != tt.want {
				t.Fatalf("expected status %q, got %q", tt.want, got)
			}
		})
	}
}

func TestDefaultTierStageForStatus(t *testing.T) {
	tests := []struct {
		name             string
		rawStatus        string
		normalizedStatus string
		want             string
	}{
		{
			name:             "tier1 created maps to tier1",
			rawStatus:        "created",
			normalizedStatus: "created",
			want:             "tier1",
		},
		{
			name:             "tier3 prefixed status maps to tier3",
			rawStatus:        "kyc_tier_3_completed",
			normalizedStatus: "completed",
			want:             "tier3",
		},
		{
			name:             "unknown defaults to tier2",
			rawStatus:        "completed",
			normalizedStatus: "completed",
			want:             "tier2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := defaultTierStageForStatus(tt.rawStatus, tt.normalizedStatus)
			if got != tt.want {
				t.Fatalf("expected fallback stage %q, got %q", tt.want, got)
			}
		})
	}
}

func TestShouldPublishCustomerVerifiedForTier2(t *testing.T) {
	tests := []struct {
		name              string
		stage             string
		normalizedStatus  string
		stageFromFallback bool
		want              bool
	}{
		{
			name:             "publishes for explicit tier2 completion",
			stage:            "tier2",
			normalizedStatus: "completed",
			want:             true,
		},
		{
			name:              "does not publish for fallback tier2 completion",
			stage:             "tier2",
			normalizedStatus:  "completed",
			stageFromFallback: true,
			want:              false,
		},
		{
			name:             "does not publish for tier3 completion",
			stage:            "tier3",
			normalizedStatus: "completed",
			want:             false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldPublishCustomerVerifiedForTier2(tt.stage, tt.normalizedStatus, tt.stageFromFallback)
			if got != tt.want {
				t.Fatalf("expected publish=%v, got %v", tt.want, got)
			}
		})
	}
}

func TestNormalizeAnchorNigerianPhone(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:  "normalizes_plus_234",
			input: "+2348181664488",
			want:  "08181664488",
		},
		{
			name:  "normalizes_plain_234",
			input: "2348181664488",
			want:  "08181664488",
		},
		{
			name:  "keeps_local_11_digits",
			input: "08181664488",
			want:  "08181664488",
		},
		{
			name:  "normalizes_local_10_digits",
			input: "8181664488",
			want:  "08181664488",
		},
		{
			name:    "rejects_invalid_phone",
			input:   "12345",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeAnchorNigerianPhone(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("normalizeAnchorNigerianPhone(%q) expected error, got nil", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeAnchorNigerianPhone(%q) unexpected error: %v", tt.input, err)
			}
			if got != tt.want {
				t.Fatalf("normalizeAnchorNigerianPhone(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
