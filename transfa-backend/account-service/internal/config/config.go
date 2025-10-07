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
	DatabaseURL      string `mapstructure:"DATABASE_URL"`
	RabbitMQURL      string `mapstructure:"RABBITMQ_URL"`
	AnchorAPIKey     string `mapstructure:"ANCHOR_API_KEY"`
	AnchorAPIBaseURL string `mapstructure:"ANCHOR_API_BASE_URL"`
	ServerPort       string `mapstructure:"SERVER_PORT"`
}

// LoadConfig reads configuration from file or environment variables.
func LoadConfig() (config Config, err error) {
	viper.AddConfigPath(".")
	viper.SetConfigName(".env")
	viper.SetConfigType("env")

	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Set default values
	viper.SetDefault("SERVER_PORT", "8082")

	// Bind envs explicitly so containers pick them up reliably
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("RABBITMQ_URL")
	_ = viper.BindEnv("ANCHOR_API_KEY")
	_ = viper.BindEnv("ANCHOR_API_BASE_URL")
	_ = viper.BindEnv("SERVER_PORT")

	if err = viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Fatalf("Error reading config file: %s", err)
		}
	}

	if err = viper.Unmarshal(&config); err != nil {
		log.Fatalf("Unable to decode config into struct: %v", err)
	}

	return
}
