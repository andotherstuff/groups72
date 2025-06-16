# YOLO Deployment Guide 🚀

## Quick Deploy (Because who needs staging?)

### 1. Install Dependencies
```bash
cd worker/cloudflare-worker
npm install
```

### 2. Configure Secrets
```bash
# Set up your Cloudflare secrets
wrangler secret put PUSH_DISPATCH_API
wrangler secret put BOT_TOKEN
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_PUBLIC_KEY
```

### 3. Update wrangler.toml
```toml
name = "nostr-nip72-poller"
main = "src/worker-enhanced.ts"
compatibility_date = "2023-05-18"
node_compat = true

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

[triggers]
crons = ["*/5 * * * *"] # Poll every 5 minutes YOLO!

[env.production]
vars = { RELAY_URL = "wss://relay.chorus.community/" }
```

### 4. Deploy to Production (YOLO!)
```bash
npm run deploy
```

## Testing in Production (The YOLO Way)

### 1. Register a Test User
```bash
curl -X POST https://nostr-nip72-poller.protestnet.workers.dev/register \
  -H "Content-Type: application/json" \
  -d '{
    "npub": "npub1test...",
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    },
    "preferences": {
      "subscriptions": {
        "groups": ["protest-net/test-group"],
        "keywords": ["urgent", "test"],
        "authors": []
      },
      "settings": {
        "mentions": true,
        "groupActivity": true,
        "frequency": "immediate"
      }
    }
  }'
```

### 2. Send a Test Notification
```bash
curl -X POST https://nostr-nip72-poller.protestnet.workers.dev/test-notification \
  -H "Content-Type: application/json" \
  -d '{
    "npub": "npub1test...",
    "message": "YOLO! Testing in production! 🚀"
  }'
```

### 3. Run YOLO Tests
```bash
# Run all test scenarios (posts to live relays and cleans up)
npm run test:all

# Test specific scenarios
npm run test:mention-detection
npm run test:notifications

# Monitor live system
npm run monitor:notifications
```

### 4. Check Stats
```bash
curl https://nostr-nip72-poller.protestnet.workers.dev/stats
```

## Production Monitoring

### Real-time Logs
```bash
wrangler tail --format pretty
```

### KV Storage Inspection
```bash
# List all users
wrangler kv:key list --binding KV --prefix "user:"

# Check specific user
wrangler kv:key get --binding KV "user:npub1..."

# View today's stats
wrangler kv:key get --binding KV "stats:2024-05-23"
```

## YOLO Best Practices

1. **Test with Real Data**: Use live relays, real events, real notifications
2. **Clean Up After Yourself**: Always delete test events (kind 5)
3. **Monitor Everything**: Log liberally, check stats frequently
4. **Rate Limit Yourself**: Don't spam users, even in testing
5. **Have Fun**: It's YOLO, but responsible YOLO!

## Rollback Plan (Just in Case)

```bash
# Quick rollback to previous version
wrangler rollback

# Or redeploy the old worker
cp src/worker.ts src/worker-enhanced.ts
npm run deploy
```

## Performance Targets

- ⚡ Process 10,000 events per minute
- 🚀 Sub-200ms notification delivery
- 💪 99.9% uptime
- 📦 Less than 10MB KV storage per 1000 users

## Debugging Production Issues

### Check Recent Events
```javascript
// Add this temporary endpoint to worker
case '/debug/recent-events':
  const events = await env.KV.list({ prefix: 'event_cache:' });
  return new Response(JSON.stringify(events), {
    headers: { 'Content-Type': 'application/json' }
  });
```

### Force Reprocess Events
```bash
# Clear event cache to reprocess
wrangler kv:key delete --binding KV --prefix "event_cache:"
```

### Emergency Stop
```bash
# Disable cron trigger temporarily
wrangler deploy --compatibility-date 2023-05-18 --no-triggers
```

## Success Metrics

- 📈 Notification delivery rate > 95%
- ⏱️ Average processing time < 100ms
- 😊 User satisfaction: "This is awesome!"
- 🎉 Zero data loss (thanks to event cleanup!)

Remember: We're not reckless, we're confidently iterating in production! 🚀

## Support

If something goes wrong (it won't, but just in case):
1. Check the logs: `wrangler tail`
2. Check the stats: `/stats` endpoint
3. Run cleanup: `npm run test:cleanup`
4. Rollback if needed: `wrangler rollback`

Happy YOLO deploying! 🎊
