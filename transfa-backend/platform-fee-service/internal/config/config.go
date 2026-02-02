/**
 * @description
 * Configuration management for the platform-fee service.
 */
package config

import (
	"os"

	"github.com/spf13/viper"
)

// Config holds all configuration for the application.
type Config struct {
	ServerPort            string `mapstructure:"SERVER_PORT"`
	DatabaseURL           string `mapstructure:"DATABASE_URL"`
	ClerkJWKSURL          string `mapstructure:"CLERK_JWKS_URL"`
	TransactionServiceURL string `mapstructure:"TRANSACTION_SERVICE_URL"`
	InternalAPIKey        string `mapstructure:"INTERNAL_API_KEY"`
	BusinessTimezone      string `mapstructure:"BUSINESS_TIMEZONE"`
	RabbitMQURL           string `mapstructure:"RABBITMQ_URL"`
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
	_ = viper.BindEnv("INTERNAL_API_KEY")
	_ = viper.BindEnv("BUSINESS_TIMEZONE")
	_ = viper.BindEnv("RABBITMQ_URL")

	err = viper.Unmarshal(&config)
	if port := os.Getenv("PORT"); port != "" {
		config.ServerPort = port
	}
	return
}
