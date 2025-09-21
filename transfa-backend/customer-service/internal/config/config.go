/**
 * @description
 * This file is responsible for managing the configuration of the customer-service.
 * It uses the Viper library to read settings from environment variables or a .env file,
 * making the application environment-agnostic.
 *
 * @dependencies
 * - github.com/spf13/viper: For configuration management.
 *
 * @notes
 * - Configuration is loaded into a `Config` struct for type-safe access throughout the application.
 * - It's configured to automatically read from environment variables, which is ideal for
 *   containerized production deployments.
 */
package config

import (
	"log"
	"strings"

	"github.com/spf13/viper"
)

// Config stores all configuration for the application.
// The values are read by viper from a config file or environment variables.
type Config struct {
	DatabaseURL      string `mapstructure:"DATABASE_URL"`
	RabbitMQURL      string `mapstructure:"RABBITMQ_URL"`
	AnchorAPIKey     string `mapstructure:"ANCHOR_API_KEY"`
	AnchorAPIBaseURL string `mapstructure:"ANCHOR_API_BASE_URL"`
}

// LoadConfig reads configuration from file or environment variables.
func LoadConfig() (config Config, err error) {
	// Tell viper the path to look for the config file in.
	viper.AddConfigPath(".")
	// Tell viper the name of the config file (without extension).
	viper.SetConfigName(".env")
	// Tell viper the type of the config file.
	viper.SetConfigType("env")

	// This allows viper to read variables from the environment
	viper.AutomaticEnv()
	// This replaces dots with underscores in env variables
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Bind env vars explicitly
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("RABBITMQ_URL")
	_ = viper.BindEnv("ANCHOR_API_KEY")
	_ = viper.BindEnv("ANCHOR_API_BASE_URL")

	// Read the config file
	err = viper.ReadInConfig()
	if err != nil {
		// If the config file is not found, it's not a fatal error,
		// as we can rely on environment variables.
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Fatalf("Error reading config file: %s", err)
		}
	}

	// Unmarshal the config into the Config struct
	err = viper.Unmarshal(&config)
	if err != nil {
		log.Fatalf("Unable to decode into struct: %v", err)
	}

	return
}
