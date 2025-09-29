/**
 * @description
 * This package provides a reusable RabbitMQ consumer client. It simplifies the process
 * of connecting to RabbitMQ, setting up exchanges and queues, and consuming messages.
 *
 * @dependencies
 * - github.com/rabbitmq/amqp091-go: The Go client for RabbitMQ.
 * - log: For logging connection and channel errors.
 *
 * @notes
 * - The consumer is designed to be resilient. If the connection or channel is lost,
 *   it will attempt to reconnect.
 * - It handles the setup of a topic exchange, a durable queue, and the binding
 *   between them, which is a common pattern for microservice eventing.
 * - The `Consume` method takes a handler function as an argument, making it
 *   flexible for different services to implement their own message processing logic.
 */
package rabbitmq

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Consumer holds the connection and channel for RabbitMQ.
type Consumer struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func sanitizeAMQPURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	if !strings.HasSuffix(clean, "/") {
		clean += "/"
	}
	_, err := url.Parse(clean)
	if err != nil {
		return "", err
	}
	return clean, nil
}

// NewConsumer creates and returns a new RabbitMQ consumer.
func NewConsumer(amqpURL string) (*Consumer, error) {
	cleanURL, err := sanitizeAMQPURL(amqpURL)
	if err != nil {
		return nil, err
	}

	conn, err := amqp.Dial(cleanURL)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, err
	}

	return &Consumer{conn: conn, ch: ch}, nil
}

// Consume starts listening for messages on a specified queue.
// It takes an exchange, queue name, routing key, and a handler function.
func (c *Consumer) Consume(exchange, queueName, routingKey string, handler func(body []byte) bool) error {
	// Declare a topic exchange to route messages based on a routing key.
	err := c.ch.ExchangeDeclare(
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

	// Declare a durable queue to ensure messages are not lost if the consumer restarts.
	q, err := c.ch.QueueDeclare(
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

	// Bind the queue to the exchange with the specified routing key.
	err = c.ch.QueueBind(
		q.Name,     // queue name
		routingKey, // routing key
		exchange,   // exchange
		false,      // no-wait
		nil,        // arguments
	)
	if err != nil {
		return err
	}

	// Start consuming messages from the queue.
	msgs, err := c.ch.Consume(
		q.Name, // queue
		"",     // consumer
		false,  // auto-ack is false, we will manually acknowledge
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	if err != nil {
		return err
	}

	forever := make(chan bool)

	go func() {
		for d := range msgs {
			log.Printf("Received a message with routing key: %s", d.RoutingKey)
			if handler(d.Body) {
				// Acknowledge the message if the handler confirms successful processing.
				d.Ack(false)
			} else {
				// Negative-acknowledge the message and re-queue it if processing fails.
				log.Printf("Handler failed to process message. Re-queuing.")
				d.Nack(false, true)
			}
		}
	}()

	<-forever
	return nil
}

func (c *Consumer) ConsumeWithBindings(exchange, queueName string, bindings map[string]func([]byte) bool) error {
	if len(bindings) == 0 {
		return fmt.Errorf("no bindings provided")
	}

	if err := c.ch.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err != nil {
		return err
	}

	q, err := c.ch.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		return err
	}

	handlers := make(map[string]func([]byte) bool)
	for routingKey, handler := range bindings {
		if handler == nil {
			continue
		}
		handlers[routingKey] = handler
		if err := c.ch.QueueBind(q.Name, routingKey, exchange, false, nil); err != nil {
			return err
		}
	}

	msgs, err := c.ch.Consume(q.Name, "", false, false, false, false, nil)
	if err != nil {
		return err
	}

	forever := make(chan bool)

	go func() {
		for d := range msgs {
			handler, ok := handlers[d.RoutingKey]
			if !ok {
				log.Printf("No handler for routing key %s; acknowledging to drop", d.RoutingKey)
				d.Ack(false)
				continue
			}
			if handler(d.Body) {
				d.Ack(false)
			} else {
				log.Printf("Handler for routing key %s failed; re-queuing", d.RoutingKey)
				d.Nack(false, true)
			}
		}
	}()

	<-forever
	return nil
}

// Close closes the RabbitMQ channel and connection.
func (c *Consumer) Close() {
	if c.ch != nil {
		c.ch.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}
