/**
 * @description
 * This file handles configuration management for the account-service.
 */
package config

import "github.com/spf13/viper"

// Config holds all configuration for the application.
type Config struct {
	ServerPort        string `mapstructure:"SERVER_PORT"`
	DatabaseURL       string `mapstructure:"DATABASE_URL"`
	ClerkJWKSURL      string `mapstructure:"CLERK_JWKS_URL"`
	AnchorAPIKey      string `mapstructure:"ANCHOR_API_KEY"`
	AnchorAPIBaseURL  string `mapstructure:"ANCHOR_API_BASE_URL"`
	RabbitMQURL       string `mapstructure:"RABBITMQ_URL"`
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (config Config, err error) {
	viper.SetDefault("SERVER_PORT", "8081")
	viper.AutomaticEnv()

	_ = viper.BindEnv("SERVER_PORT")
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("CLERK_JWKS_URL")
	_ = viper.BindEnv("ANCHOR_API_KEY")
	_ = viper.BindEnv("ANCHOR_API_BASE_URL")
	_ = viper.BindEnv("RABBITMQ_URL")

	err = viper.Unmarshal(&config)
	return
}
