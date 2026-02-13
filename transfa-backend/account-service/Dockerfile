# Multi-stage build for account-service
# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS builder

# Install git and ca-certificates (needed for go mod download)
RUN apk add --no-cache git ca-certificates tzdata

# Set working directory
WORKDIR /app

# Copy go mod files first for better caching
COPY go.mod go.sum ./

RUN go mod download

COPY . .

# Build the application
# CGO_ENABLED=0 creates a statically linked binary
# -a forces rebuilding of packages
# -installsuffix cgo adds a suffix to the package installation directory
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -ldflags='-w -s' -o account-service ./cmd/main.go

# Final stage - minimal image
FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/account-service .

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port (Railway will route traffic to the bound HTTP port)
EXPOSE 8080

# Health check (use runtime PORT when available)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD sh -c 'wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-8080}/health || exit 1'

# Run the application
CMD ["./account-service"]
