/**
 * @description
 * Configuration management for the scheduler-service.
 */
package config

import "github.com/spf13/viper"

// Config holds all configuration for the scheduler service.
type Config struct {
	DatabaseURL                    string `mapstructure:"DATABASE_URL"`
	TransactionServiceURL          string `mapstructure:"TRANSACTION_SERVICE_URL"`
	PlatformFeeServiceURL          string `mapstructure:"PLATFORM_FEE_SERVICE_URL"`
	PlatformFeeInternalAPIKey      string `mapstructure:"PLATFORM_FEE_INTERNAL_API_KEY"`
	PlatformFeeInvoiceJobSchedule  string `mapstructure:"PLATFORM_FEE_INVOICE_JOB_SCHEDULE"`
	PlatformFeeChargeJobSchedule   string `mapstructure:"PLATFORM_FEE_CHARGE_JOB_SCHEDULE"`
	PlatformFeeDelinqJobSchedule   string `mapstructure:"PLATFORM_FEE_DELINQ_JOB_SCHEDULE"`
	MoneyDropExpirySchedule        string `mapstructure:"MONEY_DROP_EXPIRY_SCHEDULE"`
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (*Config, error) {
	viper.SetDefault("PLATFORM_FEE_INVOICE_JOB_SCHEDULE", "5 0 1 * *")
	viper.SetDefault("PLATFORM_FEE_CHARGE_JOB_SCHEDULE", "15 0 * * *")
	viper.SetDefault("PLATFORM_FEE_DELINQ_JOB_SCHEDULE", "30 0 * * *")
	viper.SetDefault("MONEY_DROP_EXPIRY_SCHEDULE", "*/5 * * * *")
	viper.AutomaticEnv()

	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("TRANSACTION_SERVICE_URL")
	_ = viper.BindEnv("PLATFORM_FEE_SERVICE_URL")
	_ = viper.BindEnv("PLATFORM_FEE_INTERNAL_API_KEY")
	_ = viper.BindEnv("PLATFORM_FEE_INVOICE_JOB_SCHEDULE")
	_ = viper.BindEnv("PLATFORM_FEE_CHARGE_JOB_SCHEDULE")
	_ = viper.BindEnv("PLATFORM_FEE_DELINQ_JOB_SCHEDULE")
	_ = viper.BindEnv("MONEY_DROP_EXPIRY_SCHEDULE")

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
