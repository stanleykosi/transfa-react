#!/bin/bash

# Anchor Customer Deletion Script
# This script helps you delete test customers from Anchor so you can reuse email addresses

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if customer ID is provided
if [ $# -eq 0 ]; then
    print_error "Usage: $0 <customer-id>"
    print_info "Example: $0 17590519710347-anc_ind_cst"
    print_info ""
    print_info "This script will:"
    print_info "1. Fetch customer details from Anchor"
    print_info "2. Show you the customer information"
    print_info "3. Ask for confirmation before deletion"
    print_info "4. Delete the customer from Anchor"
    print_info ""
    print_info "Environment variables required:"
    print_info "  ANCHOR_API_KEY - Your Anchor API key"
    print_info "  ANCHOR_BASE_URL - Anchor API base URL (optional, defaults to sandbox)"
    exit 1
fi

CUSTOMER_ID="$1"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    print_error "Go is not installed. Please install Go 1.19+ to run this script."
    exit 1
fi

# Load environment variables from .env file if it exists
if [ -f "../.env" ]; then
    print_info "Loading environment variables from .env file"
    export $(grep -v '^#' ../.env | xargs)
elif [ -f ".env" ]; then
    print_info "Loading environment variables from .env file"
    export $(grep -v '^#' .env | xargs)
fi

# Check environment variables
if [ -z "$ANCHOR_API_KEY" ]; then
    print_error "ANCHOR_API_KEY environment variable is required"
    print_info ""
    print_info "You can set it in several ways:"
    print_info "1. Export in terminal: export ANCHOR_API_KEY='your-api-key-here'"
    print_info "2. Create a .env file in the root directory with:"
    print_info "   ANCHOR_API_KEY=your_anchor_api_key_here"
    print_info "   ANCHOR_BASE_URL=https://api.sandbox.getanchor.co"
    print_info "3. Use the values from your docker-compose.yml file"
    print_info ""
    print_info "To get your Anchor API key:"
    print_info "1. Go to https://app.getanchor.co/"
    print_info "2. Navigate to Developers > API Keys"
    print_info "3. Create a new API key or copy an existing one"
    exit 1
fi

if [ -z "$ANCHOR_BASE_URL" ]; then
    print_warning "ANCHOR_BASE_URL not set, using sandbox environment"
    export ANCHOR_BASE_URL="https://api.sandbox.getanchor.co"
fi

print_info "Deleting Anchor customer: $CUSTOMER_ID"
print_info "Using API endpoint: $ANCHOR_BASE_URL"

# Run the Go script
go run "$(dirname "$0")/delete-anchor-customer.go" "$CUSTOMER_ID"

if [ $? -eq 0 ]; then
    print_success "Customer deletion completed successfully!"
    print_info "You can now reuse the email address for testing."
else
    print_error "Customer deletion failed!"
    exit 1
fi
