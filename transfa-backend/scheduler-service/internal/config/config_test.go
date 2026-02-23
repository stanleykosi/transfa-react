package config

import (
	"strings"
	"testing"

	"github.com/spf13/viper"
)

func TestLoadConfig_FallsBackToSharedInternalAPIKey(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb?sslmode=disable")
	t.Setenv("TRANSACTION_SERVICE_URL", "http://localhost:8083")
	t.Setenv("PLATFORM_FEE_SERVICE_URL", "http://localhost:8085")
	t.Setenv("INTERNAL_API_KEY", "shared-internal-key")
	t.Setenv("TRANSACTION_SERVICE_INTERNAL_API_KEY", "")
	t.Setenv("PLATFORM_FEE_INTERNAL_API_KEY", "")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.TransactionServiceInternalAPIKey != "shared-internal-key" {
		t.Fatalf("expected tx internal key fallback to shared key, got %q", cfg.TransactionServiceInternalAPIKey)
	}
	if cfg.PlatformFeeInternalAPIKey != "shared-internal-key" {
		t.Fatalf("expected platform fee internal key fallback to shared key, got %q", cfg.PlatformFeeInternalAPIKey)
	}
}

func TestLoadConfig_FailsWhenTransactionInternalKeyMissing(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb?sslmode=disable")
	t.Setenv("TRANSACTION_SERVICE_URL", "http://localhost:8083")
	t.Setenv("PLATFORM_FEE_SERVICE_URL", "http://localhost:8085")
	t.Setenv("INTERNAL_API_KEY", "")
	t.Setenv("TRANSACTION_SERVICE_INTERNAL_API_KEY", "")
	t.Setenv("PLATFORM_FEE_INTERNAL_API_KEY", "platform-fee-key")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected missing transaction internal key error")
	}
	if !strings.Contains(err.Error(), "TRANSACTION_SERVICE_INTERNAL_API_KEY") {
		t.Fatalf("expected error to mention transaction internal key, got %v", err)
	}
}
