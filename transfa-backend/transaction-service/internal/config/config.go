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
	ServerPort                         string  `mapstructure:"SERVER_PORT"`
	DatabaseURL                        string  `mapstructure:"DATABASE_URL"`
	RedisURL                           string  `mapstructure:"REDIS_URL"`
	RedisRateLimitPrefix               string  `mapstructure:"REDIS_RATE_LIMIT_PREFIX"`
	RabbitMQURL                        string  `mapstructure:"RABBITMQ_URL"`
	TransferEventQueue                 string  `mapstructure:"TRANSFER_EVENT_QUEUE"`
	AnchorAPIBaseURL                   string  `mapstructure:"ANCHOR_API_BASE_URL"`
	AnchorAPIKey                       string  `mapstructure:"ANCHOR_API_KEY"`
	ClerkJWKSURL                       string  `mapstructure:"CLERK_JWKS_URL"`
	AccountServiceURL                  string  `mapstructure:"ACCOUNT_SERVICE_URL"`
	AccountServiceInternalAPIKey       string  `mapstructure:"ACCOUNT_SERVICE_INTERNAL_API_KEY"`
	AdminAccountID                     string  `mapstructure:"ADMIN_ACCOUNT_ID"`
	InternalAPIKey                     string  `mapstructure:"INTERNAL_API_KEY"`
	P2PTransactionFeeKobo              int64   `mapstructure:"P2P_TRANSACTION_FEE_KOBO"`
	MoneyDropFeeKobo                   int64   `mapstructure:"MONEY_DROP_FEE_KOBO"`
	MoneyDropFeePercent                float64 `mapstructure:"MONEY_DROP_FEE_PERCENT"`
	MoneyDropShareBaseURL              string  `mapstructure:"MONEY_DROP_SHARE_BASE_URL"`
	MoneyDropPasswordKey               string  `mapstructure:"MONEY_DROP_PASSWORD_ENCRYPTION_KEY"`
	MoneyDropClaimRateLimitPerMinute   int     `mapstructure:"MONEY_DROP_CLAIM_RATE_LIMIT_PER_MINUTE"`
	MoneyDropDetailsRateLimitPerMinute int     `mapstructure:"MONEY_DROP_DETAILS_RATE_LIMIT_PER_MINUTE"`
	MoneyDropPasswordMaxAttempts       int     `mapstructure:"MONEY_DROP_PASSWORD_MAX_ATTEMPTS"`
	MoneyDropPasswordLockoutSeconds    int     `mapstructure:"MONEY_DROP_PASSWORD_LOCKOUT_SECONDS"`
	MoneyDropClaimIdempotencyTTLMin    int     `mapstructure:"MONEY_DROP_CLAIM_IDEMPOTENCY_TTL_MINUTES"`
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
	viper.SetDefault("MONEY_DROP_FEE_PERCENT", 0.0)
	viper.SetDefault("MONEY_DROP_SHARE_BASE_URL", "https://TryTransfa.com")
	viper.SetDefault("REDIS_RATE_LIMIT_PREFIX", "transfa:rate_limit")
	viper.SetDefault("MONEY_DROP_CLAIM_RATE_LIMIT_PER_MINUTE", 30)
	viper.SetDefault("MONEY_DROP_DETAILS_RATE_LIMIT_PER_MINUTE", 120)
	viper.SetDefault("MONEY_DROP_PASSWORD_MAX_ATTEMPTS", 5)
	viper.SetDefault("MONEY_DROP_PASSWORD_LOCKOUT_SECONDS", 600)
	viper.SetDefault("MONEY_DROP_CLAIM_IDEMPOTENCY_TTL_MINUTES", 1440)

	// Bind environment variables explicitly to ensure they appear in Unmarshal
	_ = viper.BindEnv("SERVER_PORT")
	_ = viper.BindEnv("PORT")
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("REDIS_URL", "REDIS_URL", "TRANSACTION_REDIS_URL")
	_ = viper.BindEnv("REDIS_RATE_LIMIT_PREFIX")
	_ = viper.BindEnv("RABBITMQ_URL")
	_ = viper.BindEnv("TRANSFER_EVENT_QUEUE")
	_ = viper.BindEnv("ANCHOR_API_BASE_URL")
	_ = viper.BindEnv("ANCHOR_API_KEY")
	_ = viper.BindEnv("CLERK_JWKS_URL")
	_ = viper.BindEnv("ACCOUNT_SERVICE_URL")
	_ = viper.BindEnv("ACCOUNT_SERVICE_INTERNAL_API_KEY")
	_ = viper.BindEnv("ADMIN_ACCOUNT_ID")
	_ = viper.BindEnv("INTERNAL_API_KEY", "INTERNAL_API_KEY", "TRANSACTION_SERVICE_INTERNAL_API_KEY")
	_ = viper.BindEnv("P2P_TRANSACTION_FEE_KOBO")
	_ = viper.BindEnv("P2P_TRANSACTION_FEE")
	_ = viper.BindEnv("P2P_TRANSACTION_FEE_NAIRA")
	_ = viper.BindEnv("MONEY_DROP_FEE_KOBO")
	_ = viper.BindEnv("MONEY_DROP_FEE")
	_ = viper.BindEnv("MONEY_DROP_FEE_NAIRA")
	_ = viper.BindEnv("MONEY_DROP_FEE_PERCENT")
	_ = viper.BindEnv("MONEY_DROP_FEE_PERCENTAGE")
	_ = viper.BindEnv("MONEY_DROP_SHARE_BASE_URL")
	_ = viper.BindEnv("MONEY_DROP_PASSWORD_ENCRYPTION_KEY")
	_ = viper.BindEnv("MONEY_DROP_CLAIM_RATE_LIMIT_PER_MINUTE")
	_ = viper.BindEnv("MONEY_DROP_DETAILS_RATE_LIMIT_PER_MINUTE")
	_ = viper.BindEnv("MONEY_DROP_PASSWORD_MAX_ATTEMPTS")
	_ = viper.BindEnv("MONEY_DROP_PASSWORD_LOCKOUT_SECONDS")
	_ = viper.BindEnv("MONEY_DROP_CLAIM_IDEMPOTENCY_TTL_MINUTES")

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
	if strings.TrimSpace(config.InternalAPIKey) == "" {
		config.InternalAPIKey = strings.TrimSpace(os.Getenv("TRANSACTION_SERVICE_INTERNAL_API_KEY"))
	}
	config.AccountServiceInternalAPIKey = strings.TrimSpace(config.AccountServiceInternalAPIKey)
	if config.AccountServiceInternalAPIKey == "" {
		config.AccountServiceInternalAPIKey = config.InternalAPIKey
	}
	config.RedisURL = strings.TrimSpace(config.RedisURL)
	config.RedisRateLimitPrefix = strings.TrimSpace(config.RedisRateLimitPrefix)
	if config.RedisRateLimitPrefix == "" {
		config.RedisRateLimitPrefix = "transfa:rate_limit"
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

	if viper.IsSet("MONEY_DROP_FEE_PERCENTAGE") {
		percentStr := strings.TrimSpace(viper.GetString("MONEY_DROP_FEE_PERCENTAGE"))
		if percentStr != "" {
			percentValue, parseErr := strconv.ParseFloat(percentStr, 64)
			if parseErr != nil {
				log.Printf("level=warn component=config msg=\"invalid MONEY_DROP_FEE_PERCENTAGE\" value=%q err=%v", percentStr, parseErr)
			} else {
				config.MoneyDropFeePercent = percentValue
			}
		}
	} else if viper.IsSet("MONEY_DROP_FEE_PERCENT") {
		config.MoneyDropFeePercent = viper.GetFloat64("MONEY_DROP_FEE_PERCENT")
	}

	if config.MoneyDropFeePercent < 0 {
		log.Printf("level=warn component=config msg=\"negative money-drop fee percent configured; coercing to zero\" fee_percent=%f", config.MoneyDropFeePercent)
		config.MoneyDropFeePercent = 0
	}
	if config.MoneyDropFeePercent > 100 {
		log.Printf("level=warn component=config msg=\"money-drop fee percent too high; capping at 100\" fee_percent=%f", config.MoneyDropFeePercent)
		config.MoneyDropFeePercent = 100
	}

	if config.MoneyDropClaimRateLimitPerMinute <= 0 {
		config.MoneyDropClaimRateLimitPerMinute = 30
	}
	if config.MoneyDropDetailsRateLimitPerMinute <= 0 {
		config.MoneyDropDetailsRateLimitPerMinute = 120
	}
	if config.MoneyDropPasswordMaxAttempts <= 0 {
		config.MoneyDropPasswordMaxAttempts = 5
	}
	if config.MoneyDropPasswordLockoutSeconds <= 0 {
		config.MoneyDropPasswordLockoutSeconds = 600
	}
	if config.MoneyDropClaimIdempotencyTTLMin <= 0 {
		config.MoneyDropClaimIdempotencyTTLMin = 1440
	}

	return
}
