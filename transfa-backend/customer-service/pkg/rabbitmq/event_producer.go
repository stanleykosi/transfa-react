package rabbitmq

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// EventProducer publishes events to RabbitMQ exchanges.
type EventProducer struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

// NewEventProducer creates a new RabbitMQ producer.
func NewEventProducer(amqpURL string) (*EventProducer, error) {
	cleanURL, err := sanitizeProducerURL(amqpURL)
	if err != nil {
		return nil, err
	}

	conn, err := amqp.DialConfig(cleanURL, amqp.Config{Dial: amqp.DefaultDial(10 * time.Second)})
	if err != nil {
		return nil, err
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	return &EventProducer{conn: conn, channel: channel}, nil
}

// Publish sends a message to an exchange with the specified routing key.
func (p *EventProducer) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
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

	if err := p.channel.PublishWithContext(ctx, exchange, routingKey, false, false, amqp.Publishing{
		ContentType: "application/json",
		Body:        payload,
	}); err != nil {
		return err
	}

	log.Printf("Published message to exchange '%s' with routing key '%s'", exchange, routingKey)
	return nil
}

// Close releases channel and connection resources.
func (p *EventProducer) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}

func sanitizeProducerURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	idx := strings.Index(strings.ToLower(clean), "amqp")
	if idx > 0 {
		clean = clean[idx:]
	}
	parsed, err := url.Parse(clean)
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "amqp" && parsed.Scheme != "amqps" {
		return "", errors.New("AMQP scheme must be either 'amqp://' or 'amqps://'")
	}
	return clean, nil
}
