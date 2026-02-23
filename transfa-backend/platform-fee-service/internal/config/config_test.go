package config

import (
	"strings"
	"testing"

	"github.com/spf13/viper"
)

func TestLoadConfig_FallsBackToInternalAPIKeyForTransactionClient(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb?sslmode=disable")
	t.Setenv("TRANSACTION_SERVICE_URL", "http://localhost:8083")
	t.Setenv("INTERNAL_API_KEY", "shared-key")
	t.Setenv("TRANSACTION_SERVICE_INTERNAL_API_KEY", "")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.TransactionServiceInternalAPIKey != "shared-key" {
		t.Fatalf("expected tx internal key fallback to INTERNAL_API_KEY, got %q", cfg.TransactionServiceInternalAPIKey)
	}
}

func TestLoadConfig_FailsWhenTransactionClientKeyMissing(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/testdb?sslmode=disable")
	t.Setenv("TRANSACTION_SERVICE_URL", "http://localhost:8083")
	t.Setenv("INTERNAL_API_KEY", "")
	t.Setenv("TRANSACTION_SERVICE_INTERNAL_API_KEY", "")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected missing transaction-service internal key error")
	}
	if !strings.Contains(err.Error(), "TRANSACTION_SERVICE_INTERNAL_API_KEY") {
		t.Fatalf("expected error to mention transaction-service internal key, got %v", err)
	}
}
