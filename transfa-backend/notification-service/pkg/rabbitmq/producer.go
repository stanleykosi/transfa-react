/**
 * @description
 * This package provides a generic, reusable RabbitMQ event producer. It abstracts
 * away the complexities of connecting to RabbitMQ, declaring exchanges, and publishing
 * messages.
 *
 * Key features:
 * - Manages the AMQP connection and channel.
 * - Declares a topic exchange to allow for flexible, route-based message delivery.
 * - Provides a `Publish` method that marshals a Go struct into JSON and sends it.
 * - Handles proper cleanup of resources.
 *
 * @dependencies
 * - context: For managing request-scoped deadlines and cancellations.
 * - encoding/json: To serialize event payloads.
 * - github.com/rabbitmq/amqp091-go: The official Go client for RabbitMQ.
 */
package rabbitmq

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"strings"

	"github.com/rabbitmq/amqp091-go"
)

// EventProducer is a client for publishing events to RabbitMQ.
type EventProducer struct {
	conn    *amqp091.Connection
	channel *amqp091.Channel
}

func sanitizeAMQPURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	if !strings.HasSuffix(clean, "/") {
		clean += "/"
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

	conn, err := amqp091.Dial(cleanURL)
	if err != nil {
		return nil, err
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	return &EventProducer{
		conn:    conn,
		channel: channel,
	}, nil
}

// Publish sends an event to a specific exchange with a routing key.
func (p *EventProducer) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
	// Declare a topic exchange if it doesn't exist. Topic exchanges are powerful
	// for routing messages based on patterns (e.g., "user.*").
	err := p.channel.ExchangeDeclare(
		exchange, // name
		"topic",  // type
		true,     // durable
		false,    // auto-deleted
		false,    // internal
		false,    // no-wait
		nil,      // arguments
	)
	if err != nil {
		return err
	}

	// Marshal the event body into JSON.
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return err
	}

	// Publish the message.
	err = p.channel.PublishWithContext(ctx,
		exchange,   // exchange
		routingKey, // routing key
		false,      // mandatory
		false,      // immediate
		amqp091.Publishing{
			ContentType: "application/json",
			Body:        jsonBody,
		})
	if err != nil {
		return err
	}

	log.Printf("Published message to exchange '%s' with routing key '%s'", exchange, routingKey)
	return nil
}

// Close gracefully closes the channel and connection.
func (p *EventProducer) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}
