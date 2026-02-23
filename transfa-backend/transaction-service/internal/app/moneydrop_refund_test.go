package app

import "testing"

func TestCalculateMoneyDropOutstanding(t *testing.T) {
	tests := []struct {
		name               string
		totalAmount        int64
		amountPerClaim     int64
		totalClaimsAllowed int
		claimsMadeCount    int
		refundedAmount     int64
		wantTotal          int64
		wantOutstanding    int64
	}{
		{
			name:               "no prior refunds keeps full remaining",
			totalAmount:        100000,
			amountPerClaim:     10000,
			totalClaimsAllowed: 10,
			claimsMadeCount:    4,
			refundedAmount:     0,
			wantTotal:          100000,
			wantOutstanding:    60000,
		},
		{
			name:               "subtracts cumulative refunded amount",
			totalAmount:        100000,
			amountPerClaim:     10000,
			totalClaimsAllowed: 10,
			claimsMadeCount:    4,
			refundedAmount:     20000,
			wantTotal:          100000,
			wantOutstanding:    40000,
		},
		{
			name:               "clamps refunded amount to authoritative remaining",
			totalAmount:        100000,
			amountPerClaim:     10000,
			totalClaimsAllowed: 10,
			claimsMadeCount:    9,
			refundedAmount:     50000,
			wantTotal:          100000,
			wantOutstanding:    0,
		},
		{
			name:               "falls back to derived total when total amount is missing",
			totalAmount:        0,
			amountPerClaim:     10000,
			totalClaimsAllowed: 10,
			claimsMadeCount:    3,
			refundedAmount:     10000,
			wantTotal:          100000,
			wantOutstanding:    60000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotTotal, gotOutstanding := calculateMoneyDropOutstanding(
				tt.totalAmount,
				tt.amountPerClaim,
				tt.totalClaimsAllowed,
				tt.claimsMadeCount,
				tt.refundedAmount,
			)
			if gotTotal != tt.wantTotal {
				t.Fatalf("expected total=%d, got %d", tt.wantTotal, gotTotal)
			}
			if gotOutstanding != tt.wantOutstanding {
				t.Fatalf("expected outstanding=%d, got %d", tt.wantOutstanding, gotOutstanding)
			}
		})
	}
}
