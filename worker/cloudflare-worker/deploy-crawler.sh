#!/bin/bash

# Deploy script for Relay Crawler Worker

echo "🚀 Deploying Relay Crawler Worker..."

# Check if environment is provided
ENV=${1:-development}

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Environment: $ENV${NC}"

# Function to check if KV namespace exists
check_kv_namespace() {
    echo -e "${YELLOW}Checking KV namespaces...${NC}"
    
    # List existing KV namespaces
    wrangler kv:namespace list
    
    # Check if we need to create a new namespace
    read -p "Do you need to create a new KV namespace? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter namespace name (e.g., relay-crawler-kv): " namespace_name
        
        # Create namespace
        echo -e "${YELLOW}Creating KV namespace: $namespace_name${NC}"
        namespace_output=$(wrangler kv:namespace create "$namespace_name")
        echo "$namespace_output"
        
        # Create preview namespace
        echo -e "${YELLOW}Creating preview KV namespace: ${namespace_name}_preview${NC}"
        preview_output=$(wrangler kv:namespace create "${namespace_name}_preview" --preview)
        echo "$preview_output"
        
        echo -e "${GREEN}✅ KV namespaces created. Update wrangler-crawler.toml with the IDs shown above.${NC}"
        read -p "Press enter when you've updated the configuration..."
    fi
}

# Function to set secrets
set_secrets() {
    echo -e "${YELLOW}Setting up secrets...${NC}"
    
    # Check if WORKER_AUTH_TOKEN should be set
    read -p "Do you want to set WORKER_AUTH_TOKEN for manual triggers? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -s -p "Enter WORKER_AUTH_TOKEN: " auth_token
        echo
        
        if [ "$ENV" == "production" ]; then
            wrangler secret put WORKER_AUTH_TOKEN --env production -c wrangler-crawler.toml <<< "$auth_token"
        else
            wrangler secret put WORKER_AUTH_TOKEN -c wrangler-crawler.toml <<< "$auth_token"
        fi
        
        echo -e "${GREEN}✅ WORKER_AUTH_TOKEN set${NC}"
    fi
}

# Function to deploy
deploy_worker() {
    echo -e "${YELLOW}Deploying worker...${NC}"
    
    if [ "$ENV" == "production" ]; then
        echo -e "${RED}⚠️  Deploying to PRODUCTION${NC}"
        read -p "Are you sure you want to deploy to production? (yes/no): " -r
        if [[ $REPLY == "yes" ]]; then
            wrangler deploy --env production -c wrangler-crawler.toml
        else
            echo -e "${YELLOW}Production deployment cancelled${NC}"
            exit 0
        fi
    elif [ "$ENV" == "staging" ]; then
        echo -e "${YELLOW}Deploying to staging...${NC}"
        wrangler deploy --env staging -c wrangler-crawler.toml
    else
        echo -e "${YELLOW}Deploying to development...${NC}"
        wrangler deploy -c wrangler-crawler.toml
    fi
}

# Function to test the deployment
test_deployment() {
    echo -e "${YELLOW}Testing deployment...${NC}"
    
    # Get worker URL
    if [ "$ENV" == "production" ]; then
        worker_url="https://relay-crawler-prod.YOUR_SUBDOMAIN.workers.dev"
    elif [ "$ENV" == "staging" ]; then
        worker_url="https://relay-crawler-staging.YOUR_SUBDOMAIN.workers.dev"
    else
        worker_url="https://relay-crawler.YOUR_SUBDOMAIN.workers.dev"
    fi
    
    echo -e "${YELLOW}Update the worker URL above with your actual subdomain${NC}"
    read -p "Enter the worker URL: " worker_url
    
    # Test health endpoint
    echo -e "${YELLOW}Testing health endpoint...${NC}"
    curl -s "$worker_url/health" | jq .
    
    # Ask if user wants to trigger a manual crawl
    read -p "Do you want to trigger a manual crawl? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -s -p "Enter WORKER_AUTH_TOKEN (if set): " auth_token
        echo
        
        if [ -n "$auth_token" ]; then
            echo -e "${YELLOW}Triggering manual crawl...${NC}"
            curl -s -H "Authorization: Bearer $auth_token" "$worker_url/trigger" | jq .
        else
            echo -e "${YELLOW}Triggering manual crawl without auth...${NC}"
            curl -s "$worker_url/trigger" | jq .
        fi
    fi
}

# Main execution
main() {
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        echo -e "${RED}❌ wrangler CLI not found. Please install it first:${NC}"
        echo "npm install -g wrangler"
        exit 1
    fi
    
    # Check if jq is installed (for pretty JSON output)
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠️  jq not found. JSON output won't be formatted.${NC}"
    fi
    
    # Step 1: Check KV namespace
    check_kv_namespace
    
    # Step 2: Set secrets
    set_secrets
    
    # Step 3: Deploy
    deploy_worker
    
    # Step 4: Test
    read -p "Do you want to test the deployment? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_deployment
    fi
    
    echo -e "${GREEN}✅ Deployment complete!${NC}"
    echo -e "${YELLOW}The crawler will run every minute automatically.${NC}"
    echo -e "${YELLOW}Monitor logs with: wrangler tail -c wrangler-crawler.toml${NC}"
}

# Run main function
main