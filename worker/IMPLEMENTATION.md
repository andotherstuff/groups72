# Push Notifications Implementation Guide

This implementation provides comprehensive push notification support for the Nostr-based +chorus web app, following the PRD specifications.

## Architecture Overview

```
Nostr Relays → Cloudflare Worker → Push API → Web Push Service → Browsers
                      ↓                ↓
                   KV Storage    PostgreSQL DB
```

## Components Implemented

### 1. Enhanced Service Worker (`public/sw.js`)
- Handles push events and displays notifications
- Manages notification clicks and deep linking
- Communicates with React app via postMessage
- Supports background sync for offline scenarios

### 2. React Hooks and Components
- `usePushSubscription.ts`: Manages push subscription lifecycle
- `PushNotificationSettings.tsx`: UI for managing notification preferences
- Integration with existing notification system

### 3. Cloudflare Worker (`worker/cloudflare-worker/`)
- Monitors NIP-72 relays for new events
- Determines notification targets based on event type
- Queues push notifications via API
- Maintains online user status in KV storage

### 4. Push API Service (`worker/push-api/`)
- Express.js API for managing subscriptions
- Web Push notification dispatch
- Automatic cleanup of expired subscriptions
- Bot authentication for internal calls

## Setup Instructions

### 1. Generate VAPID Keys

```bash
cd worker
node generate-vapid-keys.js
```

Copy the generated keys to your environment files.

### 2. Set Up Push API

```bash
cd worker/push-api
npm install
cp .env.example .env
# Edit .env with your values
npm run build
npm run dev
```

### 3. Set Up Cloudflare Worker

```bash
cd worker/cloudflare-worker
npm install
# Edit wrangler.toml with your KV namespace IDs
npx wrangler kv:namespace create "KV"
npx wrangler deploy
```

### 4. Database Setup

Create the PostgreSQL database and run migrations:

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ
);

CREATE UNIQUE INDEX ON push_subscriptions(user_id, endpoint);
```

### 5. Update React App

Update the VAPID public key in `src/hooks/usePushSubscription.ts`:

```typescript
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';
```

## Environment Variables

### Push API (.env)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-jwt-secret
BOT_TOKEN=secure-bot-token
VAPID_EMAIL=admin@yourdomain.com
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
```

### Cloudflare Worker (wrangler.toml)
```
RELAY_URL=wss://relay.chorus.community/
PUSH_DISPATCH_API=https://your-api.com
BOT_TOKEN=same-as-push-api
```

## API Endpoints

### Push API

- `POST /api/subscriptions` - Create/update push subscription
- `GET /api/subscriptions` - Get user's subscriptions  
- `DELETE /api/subscriptions/:id` - Remove subscription
- `POST /api/push/dispatch` - Send push notification (bot only)
- `POST /api/push/test` - Send test notification (dev only)

### Cloudflare Worker

- `PUT /heartbeat` - Update user online status
- `GET /health` - Health check
- `GET /stats` - Basic statistics

## Notification Flow

1. **Event Detection**: Cloudflare Worker polls NIP-72 relay every 30 seconds
2. **Target Determination**: Worker analyzes events to find notification targets
3. **Dispatch**: Worker calls Push API with notification payload
4. **Web Push**: API sends web push notifications to subscribed browsers
5. **Display**: Service Worker shows native notification
6. **Interaction**: Clicking notification opens app with deep link

## Notification Types Supported

- **Mentions & Tags**: When user is mentioned in posts
- **Reactions**: When someone reacts to user's posts  
- **Group Activity**: New posts in followed groups
- **Join Requests**: When someone wants to join user's groups
- **Reports**: Content reports for moderators
- **Post Actions**: Approval/removal notifications

## Testing

### 1. Test Push Notifications

```bash
# Send test notification
curl -X POST http://localhost:3001/api/push/test \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "Test notification"}'
```

### 2. Verify Service Worker

Check in browser DevTools:
- Application > Service Workers
- Application > Push Messaging
- Console for push event logs

### 3. Test Cloudflare Worker

```bash
npx wrangler tail
# Trigger a scheduled event manually in dashboard
```

## Deployment

### 1. Push API Deployment

Deploy to your preferred platform (Railway, Fly.io, etc.):

```bash
npm run build
# Deploy built app
```

### 2. Cloudflare Worker Deployment

```bash
cd worker/cloudflare-worker
npx wrangler deploy --env production
```

### 3. React App Changes

The React app changes are automatically included when you build and deploy the main application.

## Monitoring and Maintenance

### 1. Metrics to Monitor

- Push notification delivery rate
- Subscription churn rate  
- API response times
- Worker execution duration
- Failed push attempts

### 2. Maintenance Tasks

- Clean up expired subscriptions (automated)
- Monitor VAPID key rotation
- Update relay endpoints as needed
- Review notification targeting logic

## Security Considerations

- VAPID keys stored securely in environment
- Bot token authentication for internal APIs
- User authentication for subscription management
- HTTPS required for service worker registration
- Subscription data encrypted in transit

## Browser Support

- Chrome 109+
- Firefox 102+
- Edge 109+
- Safari 16.4+ (limited support)

## Troubleshooting

### Common Issues

1. **Notifications not appearing**: Check browser permissions
2. **Service worker not updating**: Clear cache and re-register
3. **VAPID key mismatch**: Ensure keys match between API and client
4. **Subscription fails**: Check HTTPS and browser support

### Debug Commands

```bash
# Check service worker registration
navigator.serviceWorker.getRegistration()

# Check notification permission
Notification.permission

# Test push subscription
registration.pushManager.getSubscription()
```

## Future Enhancements

- Rich media notifications with images
- Action buttons in notifications
- Granular notification preferences
- Real-time WebSocket fallback
- Mobile app push integration
- Analytics dashboard

## Support

For issues and questions:
1. Check browser console for errors
2. Verify environment configuration  
3. Test with minimal reproduction case
4. Review server logs for API errors
