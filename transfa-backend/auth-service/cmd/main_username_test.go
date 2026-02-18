package main

import "testing"

func TestNormalizeAndValidateUsername(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:  "normalizes casing and surrounding spaces",
			input: "  Alice_12  ",
			want:  "alice_12",
		},
		{
			name:  "allows dots and underscores in middle",
			input: "a.b_c9",
			want:  "a.b_c9",
		},
		{
			name:    "rejects blank username",
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
			name:    "rejects blocked username",
			input:   "admin",
			wantErr: true,
		},
		{
			name:    "rejects non ascii punctuation",
			input:   "alice-1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeAndValidateUsername(tt.input)
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
