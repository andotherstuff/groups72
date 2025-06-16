# Nostr Groups Push Notification System

A complete push notification system for Nostr Groups (Chorus) that monitors for new posts, mentions, reactions, and moderation events.

## Components

### 1. Service Worker (public/sw.js)
- Handles push notifications in the browser
- Shows notifications when the app is closed
- Handles notification clicks to open the app

### 2. React Hooks
- `usePushNotifications` - Main hook for managing push subscriptions
- `useNotifications` - Fetches and manages in-app notifications

### 3. Notification Bot (src/bot/notification-bot.ts)
- Monitors Nostr relays for new events
- Sends push notifications to subscribed users
- Handles mentions, reactions, and moderation events

### 4. Cloudflare Worker
- Stores user subscriptions and preferences
- Dispatches push notifications
- Manages notification queues

## Features

- **Real-time Notifications** for:
  - New posts in subscribed groups
  - Mentions in posts and replies
  - Reactions to your posts
  - Post approvals/removals (moderation)
  - Join/leave requests (for moderators)
  
- **User Preferences**:
  - Toggle notification types
  - Subscribe/unsubscribe from specific groups
  - Notification frequency (immediate, hourly, daily)
  
- **Smart Delivery**:
  - Aggregates multiple notifications
  - Respects quiet hours
  - Rate limiting to prevent spam

## Setup Instructions

### 1. Environment Variables

Add these to your `.env` file:

```env
# Push Notification Configuration
VITE_WORKER_URL=https://your-worker.workers.dev
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key

# For the bot
BOT_PRIVATE_KEY=your-bot-private-key-hex
BOT_TOKEN=your-bot-auth-token
```

### 2. Generate VAPID Keys

```bash
# Install web-push globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys
```

### 3. Deploy Cloudflare Worker

```bash
cd worker/cloudflare-worker
wrangler publish
```

### 4. Run the Notification Bot

```bash
# Deploy and run the bot
./deploy-bot.sh

# Or manually
cd notification-bot
npm install
npm run build
npm start
```

## User Flow

1. User visits notification settings page
2. Clicks "Enable Push Notifications"
3. Browser asks for permission
4. If granted, subscription is created and sent to worker
5. Bot monitors relays and sends notifications via worker
6. User receives push notifications even when app is closed

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│   Worker     │◀────│     Bot     │
│             │     │              │     │             │
│ - SW.js     │     │ - Store subs │     │ - Monitor   │
│ - Push API  │     │ - Queue msgs │     │   relays    │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Push Service │
                    │   (FCM/APN)  │
                    └──────────────┘
```

## Testing

1. **Test Push Notifications**:
   - Go to notification settings
   - Enable push notifications
   - Click "Send Test Notification"

2. **Test Bot Locally**:
   ```bash
   cd notification-bot
   npm run dev
   ```

3. **Monitor Bot Logs**:
   ```bash
   # If using systemd
   sudo journalctl -u nostr-notification-bot -f
   
   # Or check bot output directly
   ```

## Troubleshooting

- **Notifications not working**: Check browser permissions and service worker registration
- **Bot not finding events**: Verify relay connections and event filters
- **Worker errors**: Check Cloudflare dashboard for logs

## Security Notes

- VAPID keys are used to authenticate push subscriptions
- Bot private key should be kept secure
- Worker uses KV storage for user data (encrypted endpoints)
- All notifications are sent over HTTPS

## Future Enhancements

- [ ] Notification categories/channels
- [ ] Custom notification sounds
- [ ] Rich notifications with images
- [ ] Notification history/archive
- [ ] Email fallback for offline users
- [ ] WebSocket connection for real-time updates