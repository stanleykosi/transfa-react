/**
 * @description
 * This file handles the configuration management for the account-service.
 * It uses the Viper library to read settings from environment variables or a .env file.
 *
 * @dependencies
 * - github.com/spf13/viper: For configuration management.
 */
package config

import (
	"log"
	"strings"

	"github.com/spf13/viper"
)

// Config stores all configuration for the application.
type Config struct {
	DatabaseURL           string `mapstructure:"DATABASE_URL"`
	RabbitMQURL           string `mapstructure:"RABBITMQ_URL"`
	AnchorAPIKey          string `mapstructure:"ANCHOR_API_KEY"`
	AnchorAPIBaseURL      string `mapstructure:"ANCHOR_API_BASE_URL"`
	SubscriptionServiceURL string `mapstructure:"SUBSCRIPTION_SERVICE_URL"`
	ServerPort            string `mapstructure:"SERVER_PORT"`
}

// LoadConfig reads configuration from file or environment variables.
func LoadConfig() (*Config, error) {
	viper.AddConfigPath(".")
	viper.SetConfigName(".env")
	viper.SetConfigType("env")

	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Set default values
	viper.SetDefault("SERVER_PORT", "8082")
	viper.SetDefault("SUBSCRIPTION_SERVICE_URL", "http://localhost:8085")

	// Bind envs explicitly so containers pick them up reliably
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("RABBITMQ_URL")
	_ = viper.BindEnv("ANCHOR_API_KEY")
	_ = viper.BindEnv("ANCHOR_API_BASE_URL")
	_ = viper.BindEnv("SUBSCRIPTION_SERVICE_URL")
	_ = viper.BindEnv("SERVER_PORT")

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Printf("Warning: Error reading config file: %s", err)
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
