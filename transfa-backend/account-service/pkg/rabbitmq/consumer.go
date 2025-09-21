/**
 * @description
 * This package provides a generic, reusable RabbitMQ consumer. It simplifies the
 * process of connecting to RabbitMQ, setting up queues and exchanges, and listening
 * for messages.
 *
 * Key features:
 * - Manages the AMQP connection and channel.
 * - Declares a topic exchange, a durable queue, and binds them with a routing key.
 * - Provides a `Consume` method that continuously listens for messages and passes
 *   them to a callback function for processing.
 * - Implements message acknowledgment logic (ack/nack) based on the callback's result.
 *
 * @dependencies
 * - log: For logging consumer status and errors.
 * - github.com/rabbitmq/amqp091-go: The official Go client for RabbitMQ.
 */
package rabbitmq

import (
	"log"
	"net/url"
	"strings"

	"github.com/rabbitmq/amqp091-go"
)

// Consumer handles the connection and consumption of messages from RabbitMQ.
type Consumer struct {
	conn    *amqp091.Connection
	channel *amqp091.Channel
}

func sanitizeAMQPURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	idx := strings.Index(strings.ToLower(clean), "amqp")
	if idx > 0 {
		clean = clean[idx:]
	}
	_, err := url.Parse(clean)
	if err != nil {
		return "", err
	}
	return clean, nil
}

// NewConsumer creates a new RabbitMQ consumer.
func NewConsumer(amqpURL string) (*Consumer, error) {
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

	return &Consumer{
		conn:    conn,
		channel: channel,
	}, nil
}

// MessageHandler is a function type that processes a single RabbitMQ message.
// It should return true to acknowledge (ack) the message, or false to reject (nack) and requeue it.
type MessageHandler func(body []byte) bool

// Consume starts listening for messages on a specified queue.
func (c *Consumer) Consume(exchange, queueName, routingKey string, handler MessageHandler) error {
	// Declare a topic exchange (if it doesn't exist).
	err := c.channel.ExchangeDeclare(
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

	// Declare a durable queue (if it doesn't exist).
	q, err := c.channel.QueueDeclare(
		queueName, // name
		true,      // durable
		false,     // delete when unused
		false,     // exclusive
		false,     // no-wait
		nil,       // arguments
	)
	if err != nil {
		return err
	}

	// Bind the queue to the exchange with the routing key.
	err = c.channel.QueueBind(
		q.Name,     // queue name
		routingKey, // routing key
		exchange,   // exchange
		false,
		nil,
	)
	if err != nil {
		return err
	}

	// Start consuming messages from the queue.
	msgs, err := c.channel.Consume(
		q.Name, // queue
		"",     // consumer
		false,  // auto-ack (we want manual acknowledgment)
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	if err != nil {
		return err
	}

	// Process messages in a loop.
	forever := make(chan bool)
	go func() {
		for d := range msgs {
			log.Printf("Received a message with routing key: %s", d.RoutingKey)
			if handler(d.Body) {
				d.Ack(false) // Acknowledge the message
			} else {
				d.Nack(false, true) // Reject and requeue the message
			}
		}
	}()

	<-forever
	return nil
}

// Close gracefully closes the channel and connection.
func (c *Consumer) Close() {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}
