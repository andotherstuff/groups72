# 🚀 YOLO Quick Deploy Guide

## Current Status
✅ **Code Ready**: All notification system code is implemented
✅ **Dependencies Installed**: npm packages ready
✅ **TypeScript Compiles**: No errors
✅ **Live Worker**: Version 1.0.0 running at https://nostr-nip72-poller.protestnet.workers.dev

## Quick Deploy Steps

### 1. Get Your Cloudflare KV Namespace
```bash
# Create a new KV namespace
npx wrangler kv:namespace create "nostr_notifications"

# This will output something like:
# { binding = "KV", id = "abcd1234..." }
# Copy the ID!
```

### 2. Update wrangler.toml
Replace `your-kv-namespace-id` with the actual ID from step 1

### 3. Set Secrets
```bash
npx wrangler secret put PUSH_DISPATCH_API
# Enter: https://your-push-api.com/dispatch

npx wrangler secret put BOT_TOKEN
# Enter: your-bot-token

npx wrangler secret put VAPID_PRIVATE_KEY
# Enter: your-vapid-private-key

npx wrangler secret put VAPID_PUBLIC_KEY
# Enter: your-vapid-public-key
```

### 4. Deploy!
```bash
npm run deploy
```

### 5. Test It
```bash
# Check health
curl https://nostr-nip72-poller.protestnet.workers.dev/health

# Send test notification
curl -X POST https://nostr-nip72-poller.protestnet.workers.dev/test-notification \
  -H "Content-Type: application/json" \
  -d '{"npub": "npub1test...", "message": "YOLO! It works!"}'
```

### 6. Monitor
```bash
npx wrangler tail --format pretty
```

## What's New in v2.0-YOLO

1. **Smart Notifications**
   - Mention detection (@npub...)
   - Keyword alerts (urgent, emergency, etc.)
   - Group activity monitoring
   - Priority-based delivery

2. **User Management**
   - Registration/unregistration endpoints
   - Preference storage in KV
   - Quiet hours support
   - Rate limiting

3. **YOLO Testing**
   - Test on live relays
   - Auto-cleanup with kind 5 events
   - Real-world scenarios

4. **Performance**
   - Notification batching
   - Event deduplication
   - WebSocket relay connections
   - 5-minute polling interval (was 30)

## File Structure
```
cloudflare-worker/
├── src/
│   ├── worker.ts               # Original worker (v1.0)
│   ├── worker-enhanced.ts      # New YOLO worker (v2.0)
│   ├── notification-system.ts  # Core notification logic
│   ├── test-utils.ts          # YOLO testing framework
│   └── test-scenarios.ts      # Live relay tests
├── wrangler.toml              # Deployment config
├── package.json               # Dependencies
└── YOLO_DEPLOYMENT.md         # This guide!
```

Remember: We're not reckless, we're just confident! 🎉
