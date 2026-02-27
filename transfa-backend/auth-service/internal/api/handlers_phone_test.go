package api

import (
	"testing"

	"github.com/transfa/auth-service/internal/domain"
)

func TestNormalizePhone(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "plus_234", input: "+2348181664488", want: "08181664488"},
		{name: "plain_234", input: "2348181664488", want: "08181664488"},
		{name: "local_11_digits", input: "08181664488", want: "08181664488"},
		{name: "local_10_digits", input: "8181664488", want: "08181664488"},
		{name: "double_prefix", input: "23408181664488", want: "08181664488"},
		{name: "invalid_short", input: "12345", want: "12345"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizePhone(tt.input)
			if got != tt.want {
				t.Fatalf("normalizePhone(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestNormalizeAndValidateOnboardingRequest_NormalizesPhone(t *testing.T) {
	req := domain.OnboardingRequest{
		UserType:    domain.PersonalUser,
		Email:       "person@example.com",
		PhoneNumber: "+2348181664488",
		KYCData: map[string]interface{}{
			"firstName":    "John",
			"lastName":     "Doe",
			"addressLine1": "1 Test Street",
			"city":         "Lagos",
			"state":        "Lagos",
			"postalCode":   "100001",
			"country":      "NG",
		},
	}

	if err := normalizeAndValidateOnboardingRequest(&req); err != nil {
		t.Fatalf("normalizeAndValidateOnboardingRequest() error = %v", err)
	}

	if req.PhoneNumber != "08181664488" {
		t.Fatalf("expected normalized phone to be 08181664488, got %s", req.PhoneNumber)
	}
}

func TestNormalizeAndValidateOnboardingRequest_RejectsInvalidPhone(t *testing.T) {
	req := domain.OnboardingRequest{
		UserType:    domain.PersonalUser,
		Email:       "person@example.com",
		PhoneNumber: "12345",
		KYCData: map[string]interface{}{
			"firstName":    "John",
			"lastName":     "Doe",
			"addressLine1": "1 Test Street",
			"city":         "Lagos",
			"state":        "Lagos",
			"postalCode":   "100001",
			"country":      "NG",
		},
	}

	if err := normalizeAndValidateOnboardingRequest(&req); err == nil {
		t.Fatal("expected invalid phone error, got nil")
	}
}
