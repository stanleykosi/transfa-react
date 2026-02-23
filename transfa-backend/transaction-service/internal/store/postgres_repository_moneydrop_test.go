package store

import (
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestParseMoneyDropIDFromAnchorReason(t *testing.T) {
	validID := uuid.New()
	tests := []struct {
		name         string
		anchorReason *string
		wantID       uuid.UUID
		wantOK       bool
	}{
		{
			name:         "nil anchor reason",
			anchorReason: nil,
			wantID:       uuid.Nil,
			wantOK:       false,
		},
		{
			name:         "empty anchor reason",
			anchorReason: ptrString("   "),
			wantID:       uuid.Nil,
			wantOK:       false,
		},
		{
			name:         "missing md drop token",
			anchorReason: ptrString("money_drop_claim;state:created"),
			wantID:       uuid.Nil,
			wantOK:       false,
		},
		{
			name:         "invalid uuid token",
			anchorReason: ptrString("md_drop:not-a-uuid;state:created"),
			wantID:       uuid.Nil,
			wantOK:       false,
		},
		{
			name:         "valid token with state suffix",
			anchorReason: ptrString("md_drop:" + validID.String() + ";state:transfer_initiated"),
			wantID:       validID,
			wantOK:       true,
		},
		{
			name:         "valid token with extra prefix text",
			anchorReason: ptrString("money_drop_claim;md_drop:" + validID.String() + ";state:created"),
			wantID:       validID,
			wantOK:       true,
		},
		{
			name:         "valid token only",
			anchorReason: ptrString("md_drop:" + validID.String()),
			wantID:       validID,
			wantOK:       true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotID, gotOK := parseMoneyDropIDFromAnchorReason(tt.anchorReason)
			if gotOK != tt.wantOK {
				t.Fatalf("expected ok=%t, got %t", tt.wantOK, gotOK)
			}
			if gotID != tt.wantID {
				t.Fatalf("expected id=%s, got %s", tt.wantID, gotID)
			}
		})
	}
}

func TestSelectUniqueMoneyDropMatch(t *testing.T) {
	txID := uuid.New()
	dropA := uuid.New()
	dropB := uuid.New()

	t.Run("no matches returns not found", func(t *testing.T) {
		_, err := selectUniqueMoneyDropMatch(nil, txID)
		if !errors.Is(err, ErrMoneyDropNotFound) {
			t.Fatalf("expected ErrMoneyDropNotFound, got %v", err)
		}
	})

	t.Run("single match returns drop id", func(t *testing.T) {
		gotID, err := selectUniqueMoneyDropMatch([]uuid.UUID{dropA}, txID)
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if gotID != dropA {
			t.Fatalf("expected id=%s, got %s", dropA, gotID)
		}
	})

	t.Run("multiple matches returns ambiguity error", func(t *testing.T) {
		_, err := selectUniqueMoneyDropMatch([]uuid.UUID{dropA, dropB}, txID)
		if err == nil {
			t.Fatal("expected ambiguity error, got nil")
		}
		if !strings.Contains(err.Error(), "ambiguous money drop mapping") {
			t.Fatalf("expected ambiguity error, got %v", err)
		}
		if !strings.Contains(err.Error(), txID.String()) {
			t.Fatalf("expected transaction id in error, got %v", err)
		}
	})
}

func ptrString(value string) *string {
	return &value
}
