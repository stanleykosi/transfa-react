/**
 * @description
 * This file handles the configuration management for the notification-service.
 * It uses the Viper library to provide a robust way of reading settings from
 * environment variables or a local .env file.
 *
 * @dependencies
 * - github.com/spf13/viper: A powerful configuration library for Go applications.
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
	ServerPort          string `mapstructure:"SERVER_PORT"`
	RabbitMQURL         string `mapstructure:"RABBITMQ_URL"`
	AnchorWebhookSecret string `mapstructure:"ANCHOR_WEBHOOK_SECRET"`
}

// LoadConfig reads configuration from file or environment variables.
func LoadConfig() (config Config, err error) {
	viper.AddConfigPath(".")
	viper.SetConfigName(".env")
	viper.SetConfigType("env")

	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Bind env vars explicitly
	_ = viper.BindEnv("SERVER_PORT")
	_ = viper.BindEnv("RABBITMQ_URL")
	_ = viper.BindEnv("ANCHOR_WEBHOOK_SECRET")

	// Read the config file if it exists.
	if err = viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Fatalf("Error reading config file: %s", err)
		}
	}

	// Unmarshal the config into the Config struct.
	if err = viper.Unmarshal(&config); err != nil {
		log.Fatalf("Unable to decode config into struct: %v", err)
	}

	return
}
