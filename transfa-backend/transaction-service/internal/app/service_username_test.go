package app

import "testing"

func TestNormalizeAndValidateUsernameInput(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:  "normalizes spaces and casing",
			input: "  Alice_12 ",
			want:  "alice_12",
		},
		{
			name:  "accepts dotted username",
			input: "john.doe",
			want:  "john.doe",
		},
		{
			name:    "rejects empty username",
			input:   "   ",
			wantErr: true,
		},
		{
			name:    "rejects leading underscore",
			input:   "_alice",
			wantErr: true,
		},
		{
			name:    "rejects trailing underscore",
			input:   "alice_",
			wantErr: true,
		},
		{
			name:    "rejects invalid symbols",
			input:   "alice-1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeAndValidateUsernameInput(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got success with %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}
