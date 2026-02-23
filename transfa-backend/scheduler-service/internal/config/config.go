/**
 * @description
 * Configuration management for the scheduler-service.
 */
package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config holds all configuration for the scheduler service.
type Config struct {
	DatabaseURL                      string `mapstructure:"DATABASE_URL"`
	InternalAPIKey                   string `mapstructure:"INTERNAL_API_KEY"`
	TransactionServiceURL            string `mapstructure:"TRANSACTION_SERVICE_URL"`
	TransactionServiceInternalAPIKey string `mapstructure:"TRANSACTION_SERVICE_INTERNAL_API_KEY"`
	PlatformFeeServiceURL            string `mapstructure:"PLATFORM_FEE_SERVICE_URL"`
	PlatformFeeInternalAPIKey        string `mapstructure:"PLATFORM_FEE_INTERNAL_API_KEY"`
	PlatformFeeInvoiceJobSchedule    string `mapstructure:"PLATFORM_FEE_INVOICE_JOB_SCHEDULE"`
	PlatformFeeChargeJobSchedule     string `mapstructure:"PLATFORM_FEE_CHARGE_JOB_SCHEDULE"`
	PlatformFeeDelinqJobSchedule     string `mapstructure:"PLATFORM_FEE_DELINQ_JOB_SCHEDULE"`
	MoneyDropExpirySchedule          string `mapstructure:"MONEY_DROP_EXPIRY_SCHEDULE"`
	MoneyDropClaimReconcileSchedule  string `mapstructure:"MONEY_DROP_CLAIM_RECONCILE_SCHEDULE"`
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (*Config, error) {
	viper.SetDefault("PLATFORM_FEE_INVOICE_JOB_SCHEDULE", "5 0 1 * *")
	viper.SetDefault("PLATFORM_FEE_CHARGE_JOB_SCHEDULE", "15 0 * * *")
	viper.SetDefault("PLATFORM_FEE_DELINQ_JOB_SCHEDULE", "30 0 * * *")
	viper.SetDefault("MONEY_DROP_EXPIRY_SCHEDULE", "*/5 * * * *")
	viper.SetDefault("MONEY_DROP_CLAIM_RECONCILE_SCHEDULE", "*/2 * * * *")
	viper.AutomaticEnv()

	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("INTERNAL_API_KEY")
	_ = viper.BindEnv("TRANSACTION_SERVICE_URL")
	_ = viper.BindEnv("TRANSACTION_SERVICE_INTERNAL_API_KEY")
	_ = viper.BindEnv("PLATFORM_FEE_SERVICE_URL")
	_ = viper.BindEnv("PLATFORM_FEE_INTERNAL_API_KEY")
	_ = viper.BindEnv("PLATFORM_FEE_INVOICE_JOB_SCHEDULE")
	_ = viper.BindEnv("PLATFORM_FEE_CHARGE_JOB_SCHEDULE")
	_ = viper.BindEnv("PLATFORM_FEE_DELINQ_JOB_SCHEDULE")
	_ = viper.BindEnv("MONEY_DROP_EXPIRY_SCHEDULE")
	_ = viper.BindEnv("MONEY_DROP_CLAIM_RECONCILE_SCHEDULE")

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	config.DatabaseURL = strings.TrimSpace(config.DatabaseURL)
	config.InternalAPIKey = strings.TrimSpace(config.InternalAPIKey)
	config.TransactionServiceURL = strings.TrimSpace(config.TransactionServiceURL)
	config.PlatformFeeServiceURL = strings.TrimSpace(config.PlatformFeeServiceURL)
	config.TransactionServiceInternalAPIKey = strings.TrimSpace(config.TransactionServiceInternalAPIKey)
	config.PlatformFeeInternalAPIKey = strings.TrimSpace(config.PlatformFeeInternalAPIKey)

	// Backward-compatible fallback: allow a shared internal key when per-service
	// keys are not explicitly configured.
	if config.TransactionServiceInternalAPIKey == "" {
		config.TransactionServiceInternalAPIKey = config.InternalAPIKey
	}
	if config.PlatformFeeInternalAPIKey == "" {
		config.PlatformFeeInternalAPIKey = config.InternalAPIKey
	}

	var missing []string
	if config.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if config.TransactionServiceURL == "" {
		missing = append(missing, "TRANSACTION_SERVICE_URL")
	}
	if config.PlatformFeeServiceURL == "" {
		missing = append(missing, "PLATFORM_FEE_SERVICE_URL")
	}
	if config.TransactionServiceInternalAPIKey == "" {
		missing = append(missing, "TRANSACTION_SERVICE_INTERNAL_API_KEY (or INTERNAL_API_KEY)")
	}
	if config.PlatformFeeInternalAPIKey == "" {
		missing = append(missing, "PLATFORM_FEE_INTERNAL_API_KEY (or INTERNAL_API_KEY)")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required configuration: %s", strings.Join(missing, ", "))
	}

	return &config, nil
}
