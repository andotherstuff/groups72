# Push Notification System - Complete Implementation

## Architecture Overview

The system now properly tracks which groups each user (npub) is subscribed to and filters events accordingly:

### 1. **Worker API** (`worker-api.ts`)
- Stores user subscriptions in Cloudflare KV
- Tracks which groups each user wants notifications for
- Manages push subscription endpoints
- Handles user preferences (mentions, reactions, etc.)
- Dispatches push notifications via Web Push API

### 2. **Enhanced Notification Bot** (`enhanced-notification-bot.ts`)
- Fetches user subscriptions from worker
- Monitors specific groups for posts (not all events)
- Filters events by actual group membership
- Tracks processed events to avoid duplicates
- Sends notifications only to relevant users

## How It Works

1. **User subscribes to notifications**:
   - Browser sends push subscription to worker
   - Worker stores user's npub, groups, and preferences in KV
   
2. **Bot monitors relays**:
   - Loads user subscriptions from worker API
   - Creates targeted filters for specific groups
   - Only monitors groups that have active subscribers
   
3. **Event processing**:
   - When new post in group: notifies only members of that group
   - When mention detected: notifies the mentioned user
   - When reaction occurs: notifies the post author
   - Respects user preferences for each notification type

## Key Improvements

### ✅ Proper Group Tracking
```javascript
// Bot now maintains:
- Map of groups with their members
- Map of users with their group subscriptions
- Filters events by actual group membership
```

### ✅ Efficient Relay Queries
```javascript
// Instead of: { kinds: [11], since: timestamp }
// Now uses: { kinds: [11], '#a': ['34550:pubkey:id'], since: timestamp }
```

### ✅ User Preference Respect
- Each user can toggle: mentions, group activity, reactions, moderation
- Bot checks preferences before sending notifications

### ✅ Deduplication
- Tracks processed event IDs
- Prevents duplicate notifications

## Deployment Steps

### 1. Deploy Cloudflare Worker

```bash
cd worker/cloudflare-worker
wrangler publish
```

Configure KV namespace:
```bash
wrangler kv:namespace create "NOTIFICATIONS"
```

### 2. Set Environment Variables

Worker needs:
```
KV (binding to your KV namespace)
BOT_TOKEN (shared secret with bot)
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

Bot needs:
```
WORKER_URL=https://your-worker.workers.dev
BOT_TOKEN=same-as-worker
```

### 3. Run the Enhanced Bot

```bash
cd notification-bot
npm install
npm run build
BOT_TOKEN=your-token node dist/enhanced-notification-bot.js
```

## Data Flow

```
User enables notifications
    ↓
Browser sends subscription to Worker
    ↓
Worker stores: npub → groups → preferences
    ↓
Bot fetches subscriptions from Worker
    ↓
Bot creates targeted relay filters
    ↓
Bot monitors only relevant groups
    ↓
On new event: Bot checks membership
    ↓
If user is member: Send to Worker
    ↓
Worker sends push notification
```

## Testing

1. **Enable notifications** in the app
2. **Subscribe to specific groups**
3. **Post in a group** - only members get notified
4. **Mention someone** - they get notified even if not in group
5. **React to a post** - author gets notified

The system now properly tracks memberships and only sends relevant notifications!