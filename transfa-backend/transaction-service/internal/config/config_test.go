package config

import (
	"os"
	"testing"

	"github.com/spf13/viper"
)

func TestLoadConfig_UsesTransactionServiceInternalAPIKeyAlias(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	unsetEnvWithCleanup(t, "INTERNAL_API_KEY")
	setEnvWithCleanup(t, "TRANSACTION_SERVICE_INTERNAL_API_KEY", "alias-only-key")

	cfg, err := LoadConfig(t.TempDir())
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.InternalAPIKey != "alias-only-key" {
		t.Fatalf("expected InternalAPIKey from alias env var, got %q", cfg.InternalAPIKey)
	}
}

func TestLoadConfig_InternalAPIKeyTakesPrecedenceOverAlias(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	setEnvWithCleanup(t, "INTERNAL_API_KEY", "primary-key")
	setEnvWithCleanup(t, "TRANSACTION_SERVICE_INTERNAL_API_KEY", "alias-key")

	cfg, err := LoadConfig(t.TempDir())
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.InternalAPIKey != "primary-key" {
		t.Fatalf("expected InternalAPIKey to prioritize INTERNAL_API_KEY, got %q", cfg.InternalAPIKey)
	}
}

func TestLoadConfig_DefaultMoneyDropFeePercentIsZero(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)

	unsetEnvWithCleanup(t, "MONEY_DROP_FEE_PERCENT")
	unsetEnvWithCleanup(t, "MONEY_DROP_FEE_PERCENTAGE")

	cfg, err := LoadConfig(t.TempDir())
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.MoneyDropFeePercent != 0 {
		t.Fatalf("expected default MoneyDropFeePercent to be 0, got %f", cfg.MoneyDropFeePercent)
	}
}

func setEnvWithCleanup(t *testing.T, key string, value string) {
	t.Helper()
	prev, hadPrev := os.LookupEnv(key)
	if err := os.Setenv(key, value); err != nil {
		t.Fatalf("failed to set env %s: %v", key, err)
	}
	t.Cleanup(func() {
		if hadPrev {
			_ = os.Setenv(key, prev)
			return
		}
		_ = os.Unsetenv(key)
	})
}

func unsetEnvWithCleanup(t *testing.T, key string) {
	t.Helper()
	prev, hadPrev := os.LookupEnv(key)
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("failed to unset env %s: %v", key, err)
	}
	t.Cleanup(func() {
		if hadPrev {
			_ = os.Setenv(key, prev)
			return
		}
		_ = os.Unsetenv(key)
	})
}
