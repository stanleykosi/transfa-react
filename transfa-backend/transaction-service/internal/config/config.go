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
	"log"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/viper"
)

// Config holds all the configuration variables for the transaction-service.
// These values are loaded from environment variables.
type Config struct {
	ServerPort            string `mapstructure:"SERVER_PORT"`
	DatabaseURL           string `mapstructure:"DATABASE_URL"`
	RabbitMQURL           string `mapstructure:"RABBITMQ_URL"`
	TransferEventQueue    string `mapstructure:"TRANSFER_EVENT_QUEUE"`
	AnchorAPIBaseURL      string `mapstructure:"ANCHOR_API_BASE_URL"`
	AnchorAPIKey          string `mapstructure:"ANCHOR_API_KEY"`
	ClerkJWKSURL          string `mapstructure:"CLERK_JWKS_URL"`
	AccountServiceURL     string `mapstructure:"ACCOUNT_SERVICE_URL"`
	AdminAccountID        string `mapstructure:"ADMIN_ACCOUNT_ID"`
	P2PTransactionFeeKobo int64  `mapstructure:"P2P_TRANSACTION_FEE_KOBO"`
	MoneyDropFeeKobo      int64  `mapstructure:"MONEY_DROP_FEE_KOBO"`
}

// LoadConfig reads configuration from environment variables from the given path.
// It uses Viper to automatically bind environment variables to the Config struct.
func LoadConfig(path string) (config Config, err error) {
	// Tell viper the path to look for the optional .env file.
	viper.AddConfigPath(path)
	viper.SetConfigName(".env")
	viper.SetConfigType("env")

	// Enable automatic binding of environment variables.
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Set default values
	viper.SetDefault("SERVER_PORT", "8080")
	viper.SetDefault("TRANSFER_EVENT_QUEUE", "transaction_service.transfer_updates")
	viper.SetDefault("ADMIN_ACCOUNT_ID", "17568857819889-anc_acc")
	viper.SetDefault("P2P_TRANSACTION_FEE_KOBO", 500)
	viper.SetDefault("MONEY_DROP_FEE_KOBO", 0) // Default: no fee (can be configured)

	// Bind environment variables explicitly to ensure they appear in Unmarshal
	_ = viper.BindEnv("SERVER_PORT")
	_ = viper.BindEnv("PORT")
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("RABBITMQ_URL")
	_ = viper.BindEnv("TRANSFER_EVENT_QUEUE")
	_ = viper.BindEnv("ANCHOR_API_BASE_URL")
	_ = viper.BindEnv("ANCHOR_API_KEY")
	_ = viper.BindEnv("CLERK_JWKS_URL")
	_ = viper.BindEnv("ACCOUNT_SERVICE_URL")
	_ = viper.BindEnv("ADMIN_ACCOUNT_ID")
	_ = viper.BindEnv("P2P_TRANSACTION_FEE_KOBO")
	_ = viper.BindEnv("P2P_TRANSACTION_FEE")
	_ = viper.BindEnv("P2P_TRANSACTION_FEE_NAIRA")
	_ = viper.BindEnv("MONEY_DROP_FEE_KOBO")
	_ = viper.BindEnv("MONEY_DROP_FEE")
	_ = viper.BindEnv("MONEY_DROP_FEE_NAIRA")

	// Attempt to read the config file. It's okay if it doesn't exist.
	if err = viper.ReadInConfig(); err != nil {
		// If the config file is not found, we can ignore the error.
		// For other errors, we should return them.
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Printf("level=warn component=config msg=\"failed to read config file; using environment values\" err=%v", err)
		}
	}

	// Unmarshal the configuration into the Config struct.
	err = viper.Unmarshal(&config)
	if err != nil {
		return
	}

	if port := strings.TrimSpace(os.Getenv("PORT")); port != "" {
		config.ServerPort = port
	}

	// Allow specifying fee in whole currency units via P2P_TRANSACTION_FEE or P2P_TRANSACTION_FEE_NAIRA.
	if viper.IsSet("P2P_TRANSACTION_FEE") {
		feeStr := strings.TrimSpace(viper.GetString("P2P_TRANSACTION_FEE"))
		if feeStr != "" {
			feeValue, parseErr := strconv.ParseFloat(feeStr, 64)
			if parseErr != nil {
				log.Printf("level=warn component=config msg=\"invalid P2P_TRANSACTION_FEE\" value=%q err=%v", feeStr, parseErr)
			} else {
				config.P2PTransactionFeeKobo = int64(math.Round(feeValue * 100))
			}
		}
	} else if viper.IsSet("P2P_TRANSACTION_FEE_NAIRA") {
		feeStr := strings.TrimSpace(viper.GetString("P2P_TRANSACTION_FEE_NAIRA"))
		if feeStr != "" {
			feeValue, parseErr := strconv.ParseFloat(feeStr, 64)
			if parseErr != nil {
				log.Printf("level=warn component=config msg=\"invalid P2P_TRANSACTION_FEE_NAIRA\" value=%q err=%v", feeStr, parseErr)
			} else {
				config.P2PTransactionFeeKobo = int64(math.Round(feeValue * 100))
			}
		}
	}

	if config.P2PTransactionFeeKobo < 0 {
		log.Printf("level=warn component=config msg=\"negative p2p fee configured; coercing to zero\" fee_kobo=%d", config.P2PTransactionFeeKobo)
		config.P2PTransactionFeeKobo = 0
	}

	// Allow specifying money drop fee in whole currency units via MONEY_DROP_FEE or MONEY_DROP_FEE_NAIRA.
	if viper.IsSet("MONEY_DROP_FEE") {
		feeStr := strings.TrimSpace(viper.GetString("MONEY_DROP_FEE"))
		if feeStr != "" {
			feeValue, parseErr := strconv.ParseFloat(feeStr, 64)
			if parseErr != nil {
				log.Printf("level=warn component=config msg=\"invalid MONEY_DROP_FEE\" value=%q err=%v", feeStr, parseErr)
			} else {
				config.MoneyDropFeeKobo = int64(math.Round(feeValue * 100))
			}
		}
	} else if viper.IsSet("MONEY_DROP_FEE_NAIRA") {
		feeStr := strings.TrimSpace(viper.GetString("MONEY_DROP_FEE_NAIRA"))
		if feeStr != "" {
			feeValue, parseErr := strconv.ParseFloat(feeStr, 64)
			if parseErr != nil {
				log.Printf("level=warn component=config msg=\"invalid MONEY_DROP_FEE_NAIRA\" value=%q err=%v", feeStr, parseErr)
			} else {
				config.MoneyDropFeeKobo = int64(math.Round(feeValue * 100))
			}
		}
	}

	if config.MoneyDropFeeKobo < 0 {
		log.Printf("level=warn component=config msg=\"negative money-drop fee configured; coercing to zero\" fee_kobo=%d", config.MoneyDropFeeKobo)
		config.MoneyDropFeeKobo = 0
	}

	return
}
