#!/bin/bash

# Nostr Groups Notification Bot Deployment Script
# This script sets up and runs the notification bot

set -e

echo "🚀 Deploying Nostr Groups Notification Bot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Create bot directory if it doesn't exist
BOT_DIR="./notification-bot"
if [ ! -d "$BOT_DIR" ]; then
    echo "📁 Creating bot directory..."
    mkdir -p "$BOT_DIR"
fi

# Copy bot files
echo "📄 Copying bot files..."
cp bot-package.json "$BOT_DIR/package.json"
cp -r src/bot/* "$BOT_DIR/"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$BOT_DIR"
npm install

# Create TypeScript config
echo "⚙️ Creating TypeScript configuration..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "🔐 Creating .env file..."
    cat > .env << 'EOF'
# Nostr Groups Notification Bot Configuration

# Relays to connect to (comma-separated)
RELAYS="wss://relay.primal.net,wss://relay.damus.io,wss://relay.nostr.band,wss://relayable.org"

# Cloudflare Worker URL
WORKER_URL="https://groups-notifications.workers.dev"

# Bot private key (hex format) - Generate with: openssl rand -hex 32
BOT_PRIVATE_KEY=""

# Bot authentication token
BOT_TOKEN=""

# Poll interval in seconds
POLL_INTERVAL=30
EOF
    echo "⚠️  Please edit .env file and add your configuration"
fi

# Build the bot
echo "🔨 Building bot..."
npm run build

# Create systemd service file (optional)
echo "📝 Creating systemd service file..."
cat > nostr-notification-bot.service << EOF
[Unit]
Description=Nostr Groups Notification Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node dist/notification-bot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Bot deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Run the bot:"
echo "   - Development: npm run dev"
echo "   - Production: npm start"
echo ""
echo "3. (Optional) Install as systemd service:"
echo "   sudo cp nostr-notification-bot.service /etc/systemd/system/"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable nostr-notification-bot"
echo "   sudo systemctl start nostr-notification-bot"
echo ""
echo "4. Check bot status:"
echo "   sudo systemctl status nostr-notification-bot"
echo "   sudo journalctl -u nostr-notification-bot -f"