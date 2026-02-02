/**
 * @description
 * RabbitMQ publisher for platform fee events.
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

	"github.com/rabbitmq/amqp091-go"
)

// Publisher is the interface implemented by event publishers.
type Publisher interface {
	Publish(ctx context.Context, exchange, routingKey string, body interface{}) error
	Close()
}

// EventProducer holds the RabbitMQ connection and channel.
type EventProducer struct {
	conn    *amqp091.Connection
	channel *amqp091.Channel
}

// EventProducerFallback is a no-op publisher used when RabbitMQ is unavailable.
type EventProducerFallback struct{}

func (p *EventProducerFallback) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
	log.Printf("[MQ-FALLBACK] Would publish to exchange='%s' routingKey='%s' body=%v", exchange, routingKey, body)
	return nil
}

func (p *EventProducerFallback) Close() {}

func sanitizeAMQPURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
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

// NewEventProducer creates a RabbitMQ publisher.
func NewEventProducer(amqpURL string) (*EventProducer, error) {
	cleanURL, err := sanitizeAMQPURL(amqpURL)
	if err != nil {
		return nil, err
	}

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

// Publish sends a message to an exchange with a routing key.
func (p *EventProducer) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
	if p.channel == nil {
		return errors.New("rabbitmq channel not initialized")
	}

	if err := p.channel.ExchangeDeclare(
		exchange,
		"topic",
		true,
		false,
		false,
		false,
		nil,
	); err != nil {
		return err
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	return p.channel.PublishWithContext(ctx, exchange, routingKey, false, false, amqp091.Publishing{
		ContentType: "application/json",
		Body:        payload,
		Timestamp:   time.Now(),
	})
}

// Close closes the RabbitMQ connection.
func (p *EventProducer) Close() {
	if p.channel != nil {
		_ = p.channel.Close()
	}
	if p.conn != nil {
		_ = p.conn.Close()
	}
}
