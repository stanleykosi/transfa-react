/**
 * @description
 * Configuration management for the platform-fee service.
 */
package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
)

// Config holds all configuration for the application.
type Config struct {
	ServerPort                       string `mapstructure:"SERVER_PORT"`
	DatabaseURL                      string `mapstructure:"DATABASE_URL"`
	ClerkJWKSURL                     string `mapstructure:"CLERK_JWKS_URL"`
	TransactionServiceURL            string `mapstructure:"TRANSACTION_SERVICE_URL"`
	TransactionServiceInternalAPIKey string `mapstructure:"TRANSACTION_SERVICE_INTERNAL_API_KEY"`
	InternalAPIKey                   string `mapstructure:"INTERNAL_API_KEY"`
	BusinessTimezone                 string `mapstructure:"BUSINESS_TIMEZONE"`
	RabbitMQURL                      string `mapstructure:"RABBITMQ_URL"`
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (config Config, err error) {
	viper.SetDefault("SERVER_PORT", "8080")
	viper.SetDefault("BUSINESS_TIMEZONE", "Africa/Lagos")
	viper.AutomaticEnv()

	_ = viper.BindEnv("SERVER_PORT")
	_ = viper.BindEnv("PORT")
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("CLERK_JWKS_URL")
	_ = viper.BindEnv("TRANSACTION_SERVICE_URL")
	_ = viper.BindEnv("TRANSACTION_SERVICE_INTERNAL_API_KEY")
	_ = viper.BindEnv("INTERNAL_API_KEY")
	_ = viper.BindEnv("BUSINESS_TIMEZONE")
	_ = viper.BindEnv("RABBITMQ_URL")

	err = viper.Unmarshal(&config)
	if port := os.Getenv("PORT"); port != "" {
		config.ServerPort = port
	}

	config.ServerPort = strings.TrimSpace(config.ServerPort)
	config.DatabaseURL = strings.TrimSpace(config.DatabaseURL)
	config.ClerkJWKSURL = strings.TrimSpace(config.ClerkJWKSURL)
	config.TransactionServiceURL = strings.TrimSpace(config.TransactionServiceURL)
	config.TransactionServiceInternalAPIKey = strings.TrimSpace(config.TransactionServiceInternalAPIKey)
	config.InternalAPIKey = strings.TrimSpace(config.InternalAPIKey)
	config.BusinessTimezone = strings.TrimSpace(config.BusinessTimezone)
	config.RabbitMQURL = strings.TrimSpace(config.RabbitMQURL)

	// Backward-compatible fallback: reuse INTERNAL_API_KEY when a dedicated
	// transaction-service key is not configured.
	if config.TransactionServiceInternalAPIKey == "" {
		config.TransactionServiceInternalAPIKey = config.InternalAPIKey
	}

	var missing []string
	if config.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if config.TransactionServiceURL == "" {
		missing = append(missing, "TRANSACTION_SERVICE_URL")
	}
	if config.TransactionServiceInternalAPIKey == "" {
		missing = append(missing, "TRANSACTION_SERVICE_INTERNAL_API_KEY (or INTERNAL_API_KEY)")
	}
	if config.InternalAPIKey == "" {
		missing = append(missing, "INTERNAL_API_KEY")
	}
	if len(missing) > 0 {
		return config, fmt.Errorf("missing required configuration: %s", strings.Join(missing, ", "))
	}

	return
}
