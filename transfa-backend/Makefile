# Makefile for Transfa Backend Microservices

# Find all directories containing a go.mod file, which represent our services.
# This makes the Makefile scalable; new services will be picked up automatically.
SERVICES := $(shell find . -mindepth 2 -name go.mod -exec dirname {} \;)

# Default target when `make` is run without arguments.
.PHONY: all
all: build

# Build all services. Iterates through each service directory and runs `go build`.
# The `./...` pattern ensures all packages within the service are built.
.PHONY: build
build:
	@echo "Building all services..."
	@for service in $(SERVICES); do \
		echo "--> Building $$service"; \
		(cd $$service && go build ./...); \
	done
	@echo "All services built."

# Run tests for all services. The `-v` flag provides verbose output.
.PHONY: test
test:
	@echo "Running tests for all services..."
	@for service in $(SERVICES); do \
		echo "--> Testing $$service"; \
		(cd $$service && go test -v ./...); \
	done
	@echo "All tests complete."

# Lint all services using `golangci-lint`. This assumes `golangci-lint` is installed.
# It's a standard tool for Go projects to enforce code style and catch common errors.
.PHONY: lint
lint:
	@echo "Linting all services..."
	@for service in $(SERVICES); do \
		echo "--> Linting $$service"; \
		(cd $$service && gofmt -l . && golint ./...); \
	done
	@echo "Linting complete."

# Tidy all go.mod files to ensure dependencies are clean and consistent.
.PHONY: tidy
tidy:
	@echo "Tidying go.mod files..."
	@for service in $(SERVICES); do \
		echo "--> Tidying $$service"; \
		(cd $$service && go mod tidy); \
	done
	@echo "Tidy complete."

# Clean all build artifacts from service directories.
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	@for service in $(SERVICES); do \
		echo "--> Cleaning $$service"; \
		(cd $$service && go clean); \
	done
	@echo "Cleaning complete."

# Help target to display available commands.
.PHONY: help
help:
	@echo "Available commands:"
	@echo "  build    - Build all microservices"
	@echo "  test     - Run tests for all microservices"
	@echo "  lint     - Lint all microservices using gofmt and golint"
	@echo "  tidy     - Run go mod tidy on all microservices"
	@echo "  clean    - Clean all build artifacts"
	@echo ""
	@echo "Services detected: $(SERVICES)"
