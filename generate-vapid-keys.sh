#!/bin/bash

# Generate VAPID keys for Web Push notifications

echo "🔑 Generating VAPID keys for push notifications..."

# Check if web-push is installed
if ! command -v web-push &> /dev/null; then
    echo "📦 Installing web-push CLI..."
    npm install -g web-push
fi

# Generate keys
echo "🔐 Generating new VAPID key pair..."
KEYS=$(web-push generate-vapid-keys --json)

PUBLIC_KEY=$(echo $KEYS | jq -r '.publicKey')
PRIVATE_KEY=$(echo $KEYS | jq -r '.privateKey')

echo ""
echo "✅ VAPID keys generated successfully!"
echo ""
echo "Add these to your environment variables:"
echo ""
echo "# Frontend (.env)"
echo "VITE_VAPID_PUBLIC_KEY=$PUBLIC_KEY"
echo ""
echo "# Cloudflare Worker (use wrangler secret put)"
echo "VAPID_PUBLIC_KEY=$PUBLIC_KEY"
echo "VAPID_PRIVATE_KEY=$PRIVATE_KEY"
echo ""
echo "# To set worker secrets:"
echo "wrangler secret put VAPID_PUBLIC_KEY"
echo "wrangler secret put VAPID_PRIVATE_KEY"
echo "wrangler secret put BOT_TOKEN"
echo ""
echo "# Generate a secure bot token:"
echo "BOT_TOKEN=$(openssl rand -base64 32)"
echo ""