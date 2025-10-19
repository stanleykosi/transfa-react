/**
 * @description
 * This file handles the configuration management for the subscription-service.
 * It uses the 'viper' library to load configuration from environment variables,
 * providing a centralized and consistent way to manage application settings.
 */
package config

import (
	"github.com/spf13/viper"
)

// Config holds all configuration for the application.
type Config struct {
	ServerPort   string `mapstructure:"SERVER_PORT"`
	DatabaseURL  string `mapstructure:"DATABASE_URL"`
	ClerkJWKSURL string `mapstructure:"CLERK_JWKS_URL"`
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (config Config, err error) {
	viper.SetDefault("SERVER_PORT", "8085")
	viper.AutomaticEnv()

	// Bind environment variables explicitly to ensure they appear in Unmarshal
	_ = viper.BindEnv("SERVER_PORT")
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("CLERK_JWKS_URL")

	err = viper.Unmarshal(&config)
	return
}
