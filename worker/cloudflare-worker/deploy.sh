#!/bin/bash

# Cloudflare Worker Deployment Script
# Sets up and deploys the notification worker

set -e

echo "🚀 Deploying Cloudflare Worker for Push Notifications..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Check if logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Please log in to Cloudflare..."
    wrangler login
fi

# Create KV namespace if it doesn't exist
echo "📦 Creating KV namespace..."
KV_OUTPUT=$(wrangler kv:namespace create "NOTIFICATIONS" 2>&1 || true)

if [[ $KV_OUTPUT == *"already exists"* ]]; then
    echo "✅ KV namespace already exists"
    # Extract the ID from existing namespace
    KV_ID=$(wrangler kv:namespace list | grep -A1 "NOTIFICATIONS" | grep "id" | cut -d'"' -f4)
else
    # Extract the ID from the output
    KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
fi

if [ -z "$KV_ID" ]; then
    echo "❌ Failed to get KV namespace ID"
    echo "Please manually create the namespace and update wrangler.toml"
    exit 1
fi

echo "✅ KV Namespace ID: $KV_ID"

# Update wrangler.toml with the KV namespace ID
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/YOUR_KV_NAMESPACE_ID/$KV_ID/" wrangler.toml
    sed -i '' "s/YOUR_KV_PREVIEW_ID/$KV_ID/" wrangler.toml
else
    # Linux
    sed -i "s/YOUR_KV_NAMESPACE_ID/$KV_ID/" wrangler.toml
    sed -i "s/YOUR_KV_PREVIEW_ID/$KV_ID/" wrangler.toml
fi

# Generate secrets if they don't exist
echo ""
echo "🔑 Setting up secrets..."

# Check if VAPID keys are already set
if ! wrangler secret list | grep -q "VAPID_PUBLIC_KEY"; then
    echo "📱 Generating VAPID keys..."
    if ! command -v web-push &> /dev/null; then
        npm install -g web-push
    fi
    
    KEYS=$(web-push generate-vapid-keys --json)
    PUBLIC_KEY=$(echo $KEYS | jq -r '.publicKey')
    PRIVATE_KEY=$(echo $KEYS | jq -r '.privateKey')
    
    echo "Setting VAPID_PUBLIC_KEY..."
    echo "$PUBLIC_KEY" | wrangler secret put VAPID_PUBLIC_KEY
    
    echo "Setting VAPID_PRIVATE_KEY..."
    echo "$PRIVATE_KEY" | wrangler secret put VAPID_PRIVATE_KEY
    
    echo ""
    echo "📝 Add this to your frontend .env:"
    echo "VITE_VAPID_PUBLIC_KEY=$PUBLIC_KEY"
else
    echo "✅ VAPID keys already set"
fi

# Check if BOT_TOKEN is set
if ! wrangler secret list | grep -q "BOT_TOKEN"; then
    echo ""
    echo "🔐 Generating BOT_TOKEN..."
    BOT_TOKEN=$(openssl rand -base64 32)
    echo "$BOT_TOKEN" | wrangler secret put BOT_TOKEN
    
    echo ""
    echo "📝 Add this to your bot .env:"
    echo "BOT_TOKEN=$BOT_TOKEN"
else
    echo "✅ BOT_TOKEN already set"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build || npx tsc

# Deploy the worker
echo ""
echo "🚀 Deploying to Cloudflare..."
wrangler publish

# Get the deployed URL
WORKER_URL=$(wrangler publish --dry-run 2>&1 | grep -o 'https://[^"]*' | head -1)

echo ""
echo "✅ Worker deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Add to your frontend .env:"
echo "   VITE_WORKER_URL=$WORKER_URL"
echo ""
echo "2. Add to your bot .env:"
echo "   WORKER_URL=$WORKER_URL"
echo ""
echo "3. Start the notification bot:"
echo "   cd ../../notification-bot"
echo "   npm start"
echo ""
echo "🎉 Your push notification system is ready!"