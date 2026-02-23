package app

import "testing"

func TestShouldSkipMoneyDropClaimRetry(t *testing.T) {
	tests := []struct {
		name         string
		anchorReason *string
		want         bool
	}{
		{
			name:         "nil anchor reason is not retryable",
			anchorReason: nil,
			want:         true,
		},
		{
			name:         "created state is not retryable",
			anchorReason: ptrString("md_drop:2f77c2f5-c857-4895-9589-e3915e85a43e;state:created"),
			want:         true,
		},
		{
			name:         "retry requested state is retryable",
			anchorReason: ptrString("md_drop:2f77c2f5-c857-4895-9589-e3915e85a43e;state:reconcile_retry_requested"),
			want:         false,
		},
		{
			name:         "transfer initiated state is not retryable",
			anchorReason: ptrString("md_drop:2f77c2f5-c857-4895-9589-e3915e85a43e;state:transfer_initiated"),
			want:         true,
		},
		{
			name:         "reconcile retry initiated state is not retryable",
			anchorReason: ptrString("md_drop:2f77c2f5-c857-4895-9589-e3915e85a43e;state:reconcile_retry_initiated"),
			want:         true,
		},
		{
			name:         "reconcile retry in-flight state is not retryable",
			anchorReason: ptrString("md_drop:2f77c2f5-c857-4895-9589-e3915e85a43e;state:reconcile_retry_inflight"),
			want:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldSkipMoneyDropClaimRetry(tt.anchorReason)
			if got != tt.want {
				t.Fatalf("expected skip=%t, got %t", tt.want, got)
			}
		})
	}
}

func ptrString(value string) *string {
	return &value
}
