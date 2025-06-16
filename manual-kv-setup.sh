#!/bin/bash

# Manual KV Namespace Setup
# This does what the GitHub Actions workflow would do

echo "🚀 Manual Relay Crawler KV Setup"
echo "================================"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing Wrangler CLI..."
    npm install -g wrangler
fi

# Export Cloudflare credentials from GitHub secrets
echo "📡 Getting Cloudflare credentials from GitHub secrets..."
export CLOUDFLARE_API_TOKEN=$(gh secret view CF_API_TOKEN --repo andotherstuff/chorus)
export CLOUDFLARE_ACCOUNT_ID=$(gh secret view CF_ACCOUNT_ID --repo andotherstuff/chorus)

# Test connection
echo ""
echo "🔌 Testing Cloudflare connection..."
if wrangler whoami; then
    echo "✅ Connected to Cloudflare successfully!"
else
    echo "❌ Failed to connect. Please check your credentials."
    exit 1
fi

echo ""
echo "📦 Creating KV namespaces..."
echo ""

# Function to create namespace and capture ID
create_namespace() {
    local name=$1
    local env=$2
    
    echo "Creating namespace: $name"
    
    # Check if namespace already exists
    existing=$(wrangler kv:namespace list 2>&1 | grep -E "\"title\":\s*\"$name\"" || true)
    
    if [ -n "$existing" ]; then
        echo "⚠️  Namespace $name already exists"
        # Extract ID from existing namespace
        id=$(echo "$existing" | grep -oE '"id":\s*"[^"]*"' | cut -d'"' -f4 | head -1)
        echo "${env}_KV_ID=$id"
    else
        # Create new namespace
        output=$(wrangler kv:namespace create "$name" 2>&1)
        echo "$output"
        
        # Extract ID - updated pattern for newer wrangler output
        id=$(echo "$output" | grep -oE 'id = "[^"]*"' | cut -d'"' -f2)
        
        # If that didn't work, try another pattern
        if [ -z "$id" ]; then
            id=$(echo "$output" | grep -oE '"id":\s*"[^"]*"' | cut -d'"' -f4)
        fi
        
        if [ -n "$id" ]; then
            echo "✅ Created namespace $name with ID: $id"
            echo "${env}_KV_ID=$id"
        else
            echo "❌ Failed to extract ID for $name"
            echo "Full output: $output"
        fi
    fi
    
    # Create preview namespace
    echo "Creating preview namespace for $name..."
    preview_existing=$(wrangler kv:namespace list 2>&1 | grep -E "\"title\":\s*\"${name}_preview\"" || true)
    
    if [ -n "$preview_existing" ]; then
        echo "⚠️  Preview namespace ${name}_preview already exists"
        preview_id=$(echo "$preview_existing" | grep -oE '"id":\s*"[^"]*"' | cut -d'"' -f4 | head -1)
        echo "${env}_KV_PREVIEW_ID=$preview_id"
    else
        preview_output=$(wrangler kv:namespace create "${name}" --preview 2>&1)
        echo "$preview_output"
        
        preview_id=$(echo "$preview_output" | grep -oE 'id = "[^"]*"' | cut -d'"' -f2)
        
        if [ -z "$preview_id" ]; then
            preview_id=$(echo "$preview_output" | grep -oE '"id":\s*"[^"]*"' | cut -d'"' -f4)
        fi
        
        if [ -n "$preview_id" ]; then
            echo "✅ Created preview namespace with ID: $preview_id"
            echo "${env}_KV_PREVIEW_ID=$preview_id"
        fi
    fi
    
    echo "---"
    echo ""
}

# Create namespaces and capture output
{
    create_namespace "relay_crawler_production" "PRODUCTION"
    create_namespace "relay_crawler_staging" "STAGING"
    create_namespace "relay_crawler_development" "DEVELOPMENT"
} 2>&1 | tee namespace-creation.log

# Extract IDs from the log
echo ""
echo "📋 Extracting namespace IDs..."

# Parse the log file for IDs
PROD_ID=$(grep "PRODUCTION_KV_ID=" namespace-creation.log | cut -d'=' -f2 | tail -1)
PROD_PREVIEW_ID=$(grep "PRODUCTION_KV_PREVIEW_ID=" namespace-creation.log | cut -d'=' -f2 | tail -1)
STAGING_ID=$(grep "STAGING_KV_ID=" namespace-creation.log | cut -d'=' -f2 | tail -1)
DEV_ID=$(grep "DEVELOPMENT_KV_ID=" namespace-creation.log | cut -d'=' -f2 | tail -1)
DEV_PREVIEW_ID=$(grep "DEVELOPMENT_KV_PREVIEW_ID=" namespace-creation.log | cut -d'=' -f2 | tail -1)

# Create configuration file
cat > relay-crawler-kv-config.txt << EOF
# Relay Crawler KV Configuration
# Generated: $(date)

## Development (default)
[[kv_namespaces]]
binding = "KV"
id = "${DEV_ID:-YOUR_DEV_KV_ID}"
preview_id = "${DEV_PREVIEW_ID:-YOUR_DEV_PREVIEW_ID}"

## Production
[[env.production.kv_namespaces]]
binding = "KV"
id = "${PROD_ID:-YOUR_PROD_KV_ID}"

## Staging
[[env.staging.kv_namespaces]]
binding = "KV"
id = "${STAGING_ID:-YOUR_STAGING_KV_ID}"

# Your worker URLs will be:
# - Production: https://relay-crawler-prod.YOUR_SUBDOMAIN.workers.dev
# - Staging: https://relay-crawler-staging.YOUR_SUBDOMAIN.workers.dev
# - Development: https://relay-crawler.YOUR_SUBDOMAIN.workers.dev
EOF

echo ""
echo "✅ Configuration saved to: relay-crawler-kv-config.txt"
echo ""
echo "Next steps:"
echo "1. Copy the KV namespace configuration from relay-crawler-kv-config.txt"
echo "2. Update worker/cloudflare-worker/wrangler-crawler.toml"
echo "3. Commit and push the changes"
echo "4. The worker will deploy automatically!"

# Also try to automatically update the file
if [ -f "worker/cloudflare-worker/wrangler-crawler.toml" ] && [ -n "$DEV_ID" ] && [ -n "$PROD_ID" ] && [ -n "$STAGING_ID" ]; then
    echo ""
    echo "🔧 Attempting to update wrangler-crawler.toml automatically..."
    
    # Backup original
    cp worker/cloudflare-worker/wrangler-crawler.toml worker/cloudflare-worker/wrangler-crawler.toml.backup
    
    # Update the file
    sed -i '' "s/YOUR_KV_NAMESPACE_ID/${DEV_ID}/g" worker/cloudflare-worker/wrangler-crawler.toml
    sed -i '' "s/YOUR_KV_PREVIEW_ID/${DEV_PREVIEW_ID}/g" worker/cloudflare-worker/wrangler-crawler.toml
    sed -i '' "s/PRODUCTION_KV_NAMESPACE_ID/${PROD_ID}/g" worker/cloudflare-worker/wrangler-crawler.toml
    sed -i '' "s/STAGING_KV_NAMESPACE_ID/${STAGING_ID}/g" worker/cloudflare-worker/wrangler-crawler.toml
    
    echo "✅ Updated wrangler-crawler.toml with KV namespace IDs!"
    echo ""
    echo "Review the changes:"
    echo "git diff worker/cloudflare-worker/wrangler-crawler.toml"
fi