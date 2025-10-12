/**
 * @description
 * This package handles the configuration management for the service. It uses the
 * Viper library to read configuration from environment variables, providing a
 * centralized and straightforward way to manage application settings.
 *
 * @dependencies
 * - github.com/spf13/viper: A popular library for Go application configuration.
 */

package config

import (
	"github.com/spf13/viper"
)

// Config holds all the configuration variables for the transaction-service.
// These values are loaded from environment variables.
type Config struct {
	ServerPort       string `mapstructure:"SERVER_PORT"`
	DatabaseURL      string `mapstructure:"DATABASE_URL"`
	RabbitMQURL      string `mapstructure:"RABBITMQ_URL"`
	AnchorAPIBaseURL string `mapstructure:"ANCHOR_API_BASE_URL"`
	AnchorAPIKey     string `mapstructure:"ANCHOR_API_KEY"`
	ClerkJWKSURL     string `mapstructure:"CLERK_JWKS_URL"`
}

// LoadConfig reads configuration from environment variables from the given path.
// It uses Viper to automatically bind environment variables to the Config struct.
func LoadConfig(path string) (config Config, err error) {
	// Tell viper the path to look for the optional .env file.
	viper.AddConfigPath(path)
	viper.SetConfigName(".env")
	viper.SetConfigType("env")

	// Enable automatic binding of environment variables.
	// This means viper will check for an env var if a key is not found in the config file.
	viper.AutomaticEnv()

	// Attempt to read the config file. It's okay if it doesn't exist.
	if err = viper.ReadInConfig(); err != nil {
		// If the config file is not found, we can ignore the error.
		// For other errors, we should return them.
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return
		}
	}

	// Unmarshal the configuration into the Config struct.
	err = viper.Unmarshal(&config)
	return
}
