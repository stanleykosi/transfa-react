/**
 * @description
 * This package provides a simple producer for publishing messages to RabbitMQ.
 * It encapsulates the logic for connecting to RabbitMQ and publishing a message
 * to a specific exchange and routing key.
 *
 * @dependencies
 * - context, encoding/json, time: Standard Go libraries.
 * - github.com/rabbitmq/amqp091-go: The RabbitMQ client library.
 */
package rabbitmq

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rabbitmq/amqp091-go"
)

// PlatformFeeEvent represents the payload published to RabbitMQ when a platform fee is debited.
type PlatformFeeEvent struct {
	UserID    uuid.UUID `json:"user_id"`
	Amount    int64     `json:"amount"`
	Reason    string    `json:"reason"`
	Timestamp time.Time `json:"timestamp"`
}

// EventProducer holds the RabbitMQ connection and channel for publishing messages.
type EventProducer struct {
	conn    *amqp091.Connection
	channel *amqp091.Channel
}

// Publisher is the interface implemented by types that can publish events.
type Publisher interface {
	Publish(ctx context.Context, exchange, routingKey string, body interface{}) error
	PublishPlatformFeeEvent(ctx context.Context, event PlatformFeeEvent) error
	Close()
}

// EventProducerFallback is a minimal no-op publisher used when RabbitMQ is unavailable at startup.
type EventProducerFallback struct{}

func (p *EventProducerFallback) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
	log.Printf("level=warn component=rabbitmq_producer mode=fallback msg=\"publish skipped\" exchange=%s routing_key=%s", exchange, routingKey)
	return nil
}

func (p *EventProducerFallback) Close() {}

func (p *EventProducerFallback) PublishPlatformFeeEvent(ctx context.Context, event PlatformFeeEvent) error {
	log.Printf("level=warn component=rabbitmq_producer mode=fallback msg=\"platform fee event publish skipped\" user_id=%s", event.UserID)
	return nil
}

func sanitizeAMQPURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	// If any stray characters precede the scheme, slice from first occurrence of amqp
	idx := strings.Index(strings.ToLower(clean), "amqp")
	if idx > 0 {
		clean = clean[idx:]
	}
	u, err := url.Parse(clean)
	if err != nil {
		return "", err
	}
	if u.Scheme != "amqp" && u.Scheme != "amqps" {
		return "", errors.New("AMQP scheme must be either 'amqp://' or 'amqps://'")
	}
	return clean, nil
}

// NewEventProducer creates and returns a new EventProducer.
func NewEventProducer(amqpURL string) (*EventProducer, error) {
	cleanURL, err := sanitizeAMQPURL(amqpURL)
	if err != nil {
		return nil, err
	}

	// Use a bounded dial timeout so startup does not hang indefinitely
	conn, err := amqp091.DialConfig(cleanURL, amqp091.Config{Dial: amqp091.DefaultDial(10 * time.Second)})
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	return &EventProducer{conn: conn, channel: ch}, nil
}

// Publish sends a message to a specific exchange with a routing key.
func (p *EventProducer) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
	// Ensure the exchange exists (durable topic)
	if err := p.channel.ExchangeDeclare(
		exchange, // name
		"topic",  // type
		true,     // durable
		false,    // autoDelete
		false,    // internal
		false,    // noWait
		nil,      // args
	); err != nil {
		log.Printf("level=warn component=rabbitmq_producer msg=\"exchange declare failed; reopening channel\" exchange=%s err=%v", exchange, err)
		// Attempt simple channel reopen once
		if p.conn != nil {
			if ch, chErr := p.conn.Channel(); chErr == nil {
				p.channel = ch
				if err2 := p.channel.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err2 != nil {
					return err2
				}
			} else {
				return chErr
			}
		} else {
			return err
		}
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		log.Printf("level=error component=rabbitmq_producer msg=\"json marshal failed\" exchange=%s routing_key=%s err=%v", exchange, routingKey, err)
		return err
	}

	err = p.channel.PublishWithContext(ctx,
		exchange,   // exchange
		routingKey, // routing key
		false,      // mandatory
		false,      // immediate
		amqp091.Publishing{
			ContentType: "application/json",
			Timestamp:   time.Now(),
			Body:        jsonBody,
		},
	)
	if err != nil {
		log.Printf("level=warn component=rabbitmq_producer msg=\"publish failed; reopening channel\" exchange=%s routing_key=%s err=%v", exchange, routingKey, err)
		// One-shot retry: reopen channel and try again
		if p.conn != nil {
			if ch, chErr := p.conn.Channel(); chErr == nil {
				p.channel = ch
				// re-declare exchange and retry
				if exErr := p.channel.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); exErr == nil {
					err = p.channel.PublishWithContext(ctx, exchange, routingKey, false, false, amqp091.Publishing{
						ContentType: "application/json",
						Timestamp:   time.Now(),
						Body:        jsonBody,
					})
					if err == nil {
						return nil
					}
				}
			}
		}
		return err
	}
	return nil
}

// PublishPlatformFeeEvent publishes a platform fee event to the transaction_events exchange.
func (p *EventProducer) PublishPlatformFeeEvent(ctx context.Context, event PlatformFeeEvent) error {
	return p.Publish(ctx, "transaction_events", "platform.fee.debited", event)
}

// Close gracefully closes the channel and connection to RabbitMQ.
func (p *EventProducer) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}
