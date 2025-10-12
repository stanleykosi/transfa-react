# Use a multi-stage build to create a small, secure final image.
# syntax=docker/dockerfile:1

# --- Builder Stage ---
# Use the official Go image as a build environment.
FROM golang:1.24-alpine AS builder

# Install necessary build tools.
# git is needed to fetch Go modules.
# ca-certificates is needed for HTTPS communication.
# tzdata is needed for time zone information.
RUN apk add --no-cache git ca-certificates tzdata

# Set the working directory inside the container.
WORKDIR /app

# Copy go.mod and go.sum files to leverage Docker's build cache.
# This step is only re-run if these files change.
COPY go.mod go.sum ./

# Download all dependencies.
RUN go mod download

# Copy the rest of the source code into the container.
COPY . .

# Build the Go application.
# CGO_ENABLED=0 creates a statically linked binary without any C dependencies.
# -ldflags="-w -s" strips debugging information, reducing the binary size.
# The output binary is named 'transaction-service'.
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -ldflags='-w -s' -o transaction-service ./cmd/main.go

# --- Final Stage ---
# Use a minimal base image for the final container.
# alpine is a small, security-focused Linux distribution.
FROM alpine:latest

# Install ca-certificates for secure HTTPS requests and tzdata for time zones.
RUN apk --no-cache add ca-certificates tzdata

# Create a non-root user and group for security best practices.
# Running the application as a non-root user reduces the attack surface.
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Set the working directory.
WORKDIR /app

# Copy the built binary from the builder stage.
COPY --from=builder /app/transaction-service .

# Change ownership of the app directory to the non-root user.
RUN chown -R appuser:appgroup /app

# Switch to the non-root user.
USER appuser

# Expose the port the service will run on.
EXPOSE 8083

# Define the command to run when the container starts.
CMD ["./transaction-service"]