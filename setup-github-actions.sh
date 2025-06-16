#!/bin/bash

# Quick Setup for GitHub Actions Deployment
# This script helps you configure the repository for automated deployment

set -e

echo "🚀 Chorus Push Notifications - GitHub Actions Setup"
echo "================================================="
echo ""

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found."
    echo "Please install it from: https://cli.github.com/"
    echo "Or run: brew install gh"
    exit 1
fi

# Check if logged into GitHub
if ! gh auth status &> /dev/null; then
    echo "🔐 Please log in to GitHub..."
    gh auth login
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "📦 Repository: $REPO"
echo ""

# Function to set a secret
set_secret() {
    local name=$1
    local value=$2
    local description=$3
    
    echo "🔐 Setting secret: $name"
    echo "   $description"
    
    if [ -z "$value" ]; then
        echo "   Enter value (will be hidden):"
        gh secret set "$name"
    else
        echo "$value" | gh secret set "$name"
    fi
    echo "   ✅ Set!"
    echo ""
}

echo "📝 Let's configure your secrets..."
echo ""

# 1. Generate VAPID keys if needed
if [ ! -f "./generate-vapid-keys.sh" ]; then
    echo "Creating VAPID key generator..."
    cat > generate-vapid-keys.sh << 'EOF'
#!/bin/bash
if ! command -v web-push &> /dev/null; then
    npm install -g web-push
fi
KEYS=$(web-push generate-vapid-keys --json)
echo "VAPID Keys Generated:"
echo "PUBLIC_KEY: $(echo $KEYS | jq -r '.publicKey')"
echo "PRIVATE_KEY: $(echo $KEYS | jq -r '.privateKey')"
EOF
    chmod +x generate-vapid-keys.sh
fi

echo "🔑 Generating VAPID keys..."
./generate-vapid-keys.sh > vapid-temp.txt
VAPID_PUBLIC=$(grep "PUBLIC_KEY:" vapid-temp.txt | cut -d' ' -f2)
VAPID_PRIVATE=$(grep "PRIVATE_KEY:" vapid-temp.txt | cut -d' ' -f2)
rm vapid-temp.txt

set_secret "VAPID_PUBLIC_KEY" "$VAPID_PUBLIC" "Public key for Web Push notifications"
set_secret "VAPID_PRIVATE_KEY" "$VAPID_PRIVATE" "Private key for Web Push notifications (keep secret!)"

# 2. Generate BOT_TOKEN
echo "🤖 Generating bot token..."
BOT_TOKEN=$(openssl rand -base64 32)
set_secret "BOT_TOKEN" "$BOT_TOKEN" "Authentication token for notification bot"

# 3. Get Cloudflare API token
echo "☁️ Cloudflare API Token"
echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
echo "2. Click 'Create Token'"
echo "3. Use 'Edit Cloudflare Workers' template"
echo "4. Set permissions:"
echo "   - Account: Cloudflare Workers Scripts: Edit"
echo "   - Account: Account Settings: Read"
echo "5. Create the token"
echo ""
set_secret "CLOUDFLARE_API_TOKEN" "" "API token for deploying to Cloudflare Workers"

# 4. Optional: Discord webhook
echo "💬 Discord Webhook (optional - press Enter to skip)"
echo "For deployment notifications in Discord"
set_secret "DISCORD_WEBHOOK" "" "Discord webhook URL for deployment notifications"

echo ""
echo "✅ Secrets configuration complete!"
echo ""

# Create production env file
echo "📄 Creating production environment file..."
cat > .env.production << EOF
# Production environment variables
VITE_VAPID_PUBLIC_KEY=$VAPID_PUBLIC

# The worker URL will be set after first deployment
# VITE_WORKER_URL=https://chorus-notifications.your-account.workers.dev
EOF

echo "✅ Created .env.production"
echo ""

# Final instructions
echo "🎉 Setup complete! Next steps:"
echo ""
echo "1. Commit and push these changes:"
echo "   git add .env.production"
echo "   git commit -m 'Add production environment configuration'"
echo "   git push origin main"
echo ""
echo "2. Run the infrastructure setup:"
echo "   Go to GitHub Actions → 'Setup Cloudflare Infrastructure' → Run workflow"
echo ""
echo "3. After setup completes, update .env.production with your worker URL"
echo ""
echo "4. Future deployments will happen automatically on push to main!"
echo ""
echo "📚 See .github/workflows/README.md for more details"