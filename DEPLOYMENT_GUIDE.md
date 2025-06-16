# 🚀 Push Notifications Deployment Guide

## Overview

The push notification system consists of:
1. **Frontend** - React app with service worker
2. **Cloudflare Worker** - Manages subscriptions and queues notifications
3. **Notification Bot** - Monitors Nostr relays and triggers notifications
4. **Push Service** - Handles actual push delivery (optional)

## Step 1: Generate VAPID Keys

```bash
# Run from project root
./generate-vapid-keys.sh
```

Save the output - you'll need:
- `VITE_VAPID_PUBLIC_KEY` for frontend
- Both keys for the worker

## Step 2: Deploy Cloudflare Worker

```bash
cd worker/cloudflare-worker

# Install dependencies
npm install

# Login to Cloudflare (first time only)
wrangler login

# Run the deployment script
./deploy.sh
```

The script will:
- Create KV namespace
- Set up secrets
- Deploy the worker
- Output the worker URL

## Step 3: Configure Frontend

Create `.env.production`:
```env
VITE_WORKER_URL=https://chorus-notifications.your-subdomain.workers.dev
VITE_VAPID_PUBLIC_KEY=your-public-key-from-step-1
```

## Step 4: Deploy Notification Bot

### Option A: VPS with PM2

```bash
cd notification-bot

# Create .env file
cat > .env << EOF
WORKER_URL=https://chorus-notifications.your-subdomain.workers.dev
BOT_TOKEN=your-bot-token-from-worker-deploy
EOF

# Install dependencies
npm install

# Build
npm run build

# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/enhanced-notification-bot.js --name chorus-bot
pm2 save
pm2 startup
```

### Option B: Docker

```dockerfile
# notification-bot/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/enhanced-notification-bot.js"]
```

```bash
# Build and run
docker build -t chorus-bot notification-bot/
docker run -d --name chorus-bot \
  -e WORKER_URL=https://your-worker.workers.dev \
  -e BOT_TOKEN=your-bot-token \
  --restart unless-stopped \
  chorus-bot
```

### Option C: Railway/Render/Heroku

1. Push to GitHub
2. Connect repo to service
3. Set environment variables
4. Deploy

## Step 5: Test the System

1. **Enable notifications in browser:**
   - Go to Settings → Notifications
   - Click "Enable Push Notifications"
   - Allow browser permission

2. **Send test notification:**
   - Click "Send Test Notification"
   - Should receive within seconds

3. **Test real notifications:**
   - Post in a subscribed group
   - Mention someone
   - React to a post

## Troubleshooting

### Notifications not working?

1. **Check browser console:**
   ```javascript
   navigator.serviceWorker.getRegistration()
     .then(reg => reg.pushManager.getSubscription())
     .then(sub => console.log('Subscription:', sub))
   ```

2. **Check worker logs:**
   ```bash
   wrangler tail
   ```

3. **Check bot logs:**
   ```bash
   # PM2
   pm2 logs chorus-bot

   # Docker
   docker logs chorus-bot
   ```

### Common issues:

- **"Permission denied"** - User needs to allow notifications in browser settings
- **"Invalid VAPID key"** - Regenerate keys and update all configs
- **"Subscription expired"** - User needs to re-enable notifications
- **Bot not finding events** - Check relay connections and filters

## Production Considerations

1. **Rate Limiting:**
   - Worker: Max 10 notifications/user/hour
   - Bot: Batch similar notifications

2. **Monitoring:**
   - Set up Cloudflare Analytics
   - Add error tracking (Sentry)
   - Monitor push delivery rates

3. **Scaling:**
   - Multiple bot instances for different relay sets
   - Cloudflare Queue for notification processing
   - Redis for shared state

4. **Security:**
   - Rotate BOT_TOKEN regularly
   - Use environment-specific VAPID keys
   - Implement request signing

## Cost Estimates

- **Cloudflare Workers:** $5/month (includes 10M requests)
- **KV Storage:** Included with Workers
- **Bot Hosting:** 
  - VPS: $5-10/month
  - Railway: ~$5/month
  - Your own server: Free
- **Total:** ~$10-15/month

## Next Steps

1. Set up monitoring dashboards
2. Implement notification analytics
3. Add email fallback for critical notifications
4. Create admin panel for subscription management

## Support

- GitHub Issues: [your-repo/issues]
- Discord: [your-discord]
- Email: support@chorus.community