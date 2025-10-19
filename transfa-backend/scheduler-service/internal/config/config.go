/**
 * @description
 * This file handles configuration management for the scheduler-service.
 * It loads settings from environment variables, providing defaults for cron schedules.
 */
package config

import (
	"github.com/spf13/viper"
)

// Config holds all configuration for the scheduler service.
type Config struct {
	DatabaseURL           string `mapstructure:"DATABASE_URL"`
	TransactionServiceURL string `mapstructure:"TRANSACTION_SERVICE_URL"`
	SubscriptionFeeKobo   int64  `mapstructure:"SUBSCRIPTION_FEE_KOBO"`
	BillingJobSchedule    string `mapstructure:"BILLING_JOB_SCHEDULE"`
	ResetUsageJobSchedule string `mapstructure:"RESET_USAGE_JOB_SCHEDULE"`
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (*Config, error) {
	viper.SetDefault("BILLING_JOB_SCHEDULE", "0 2 1 * *")     // At 02:00 on day-of-month 1.
	viper.SetDefault("RESET_USAGE_JOB_SCHEDULE", "0 1 1 * *") // At 01:00 on day-of-month 1.
	viper.SetDefault("SUBSCRIPTION_FEE_KOBO", 1000)           // Default to ₦10.00
	viper.AutomaticEnv()

	// Bind environment variables explicitly to ensure they appear in Unmarshal
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("TRANSACTION_SERVICE_URL")
	_ = viper.BindEnv("SUBSCRIPTION_FEE_KOBO")
	_ = viper.BindEnv("BILLING_JOB_SCHEDULE")
	_ = viper.BindEnv("RESET_USAGE_JOB_SCHEDULE")

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
