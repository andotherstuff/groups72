# Relay Crawler Integration Example

This example shows how to integrate the Relay Crawler with the notification system or other workers.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Relay Crawler  │────▶│   Cloudflare KV  │◀────│  Notification   │
│   (1 min cron)  │     │   (Event Store)  │     │     Worker      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                                                 │
         │              ┌──────────────────┐              │
         └─────────────▶│   Event Index    │◀─────────────┘
                        │  (by kind/author) │
                        └──────────────────┘
```

## Integration Pattern

### 1. Relay Crawler Stores Events

The relay crawler runs every minute and stores events in KV:

```typescript
// relay-crawler-worker.ts stores events like this:
await env.KV.put(`event:${event.id}`, JSON.stringify(event), {
  expirationTtl: 86400 * 7 // 7 days
});

// And creates indexes:
await env.KV.put(`index:kind:${event.kind}:${event.id}`, '1', {
  expirationTtl: 86400 * 7
});
```

### 2. Notification Worker Reads Events

The notification worker can query stored events:

```typescript
// In notification worker
async function getRecentEvents(env: Env, kind: number, since: number) {
  // List all events of a specific kind
  const indexKeys = await env.KV.list({
    prefix: `index:kind:${kind}:`
  });
  
  const events = [];
  for (const key of indexKeys.keys) {
    const eventId = key.name.split(':').pop();
    const eventData = await env.KV.get(`event:${eventId}`, 'json');
    
    if (eventData && eventData.created_at >= since) {
      events.push(eventData);
    }
  }
  
  return events;
}
```

### 3. Enhanced Notification Worker

Update the notification worker to use crawled events:

```typescript
// Enhanced notification processing
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Instead of connecting to relays directly, use crawled data
    const since = Math.floor(Date.now() / 1000) - 300; // Last 5 minutes
    
    // Get group posts from crawled data
    const groupPosts = await getRecentEvents(env, 11, since);
    
    // Process each event
    for (const event of groupPosts) {
      const notifications = await analyzeEvent(event, env);
      if (notifications.length > 0) {
        await sendNotifications(env, event, notifications);
      }
    }
  }
};
```

## Example: Combined Worker

Here's how to create a worker that uses both crawling and notifications:

```typescript
// combined-worker.ts
import { NostrEvent } from 'nostr-tools';

export interface Env {
  KV: KVNamespace;
  RELAY_URLS: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

export default {
  // Crawl every minute
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cronType = event.cron;
    
    if (cronType === "* * * * *") {
      // Minute cron - crawl relays
      await this.crawlRelays(env);
    } else if (cronType === "*/5 * * * *") {
      // 5-minute cron - process notifications
      await this.processNotifications(env);
    }
  },
  
  async crawlRelays(env: Env) {
    // Crawling logic here (from relay-crawler-worker.ts)
  },
  
  async processNotifications(env: Env) {
    // Get unprocessed events from last 5 minutes
    const since = Math.floor(Date.now() / 1000) - 300;
    const processedKey = 'last_notification_check';
    const lastCheck = await env.KV.get(processedKey) || '0';
    
    // Query events that need processing
    const events = await this.getUnprocessedEvents(env, parseInt(lastCheck));
    
    for (const event of events) {
      // Check if needs notification
      const notifications = await this.analyzeForNotifications(event, env);
      
      if (notifications.length > 0) {
        await this.sendPushNotifications(env, event, notifications);
      }
    }
    
    // Update last check timestamp
    await env.KV.put(processedKey, Math.floor(Date.now() / 1000).toString());
  }
};
```

## Deployment Strategy

### Option 1: Separate Workers (Recommended)

Deploy relay crawler and notification worker separately:

```bash
# Deploy relay crawler (runs every minute)
wrangler deploy -c wrangler-crawler.toml

# Deploy notification worker (runs every 5 minutes)
wrangler deploy -c wrangler.toml
```

Benefits:
- Independent scaling
- Separate failure domains
- Easier debugging
- Different cron schedules

### Option 2: Combined Worker

Use multiple cron triggers in one worker:

```toml
# wrangler-combined.toml
[triggers]
crons = ["* * * * *", "*/5 * * * *"]
```

Benefits:
- Shared KV namespace
- Single deployment
- Unified logging

## KV Namespace Sharing

Both workers can share the same KV namespace:

```toml
# In both wrangler.toml files
[[kv_namespaces]]
binding = "KV"
id = "YOUR_SHARED_KV_NAMESPACE_ID"
```

## Query Patterns

### Get Events by Author

```typescript
async function getEventsByAuthor(env: Env, pubkey: string, limit = 100) {
  const keys = await env.KV.list({
    prefix: `index:author:${pubkey}:`,
    limit
  });
  
  const events = [];
  for (const key of keys.keys) {
    const eventId = key.name.split(':').pop();
    const event = await env.KV.get(`event:${eventId}`, 'json');
    if (event) events.push(event);
  }
  
  return events.sort((a, b) => b.created_at - a.created_at);
}
```

### Get Group Activity

```typescript
async function getGroupActivity(env: Env, groupId: string, hours = 24) {
  const since = Math.floor(Date.now() / 1000) - (hours * 3600);
  const events = await getRecentEvents(env, 11, since); // Kind 11 = group posts
  
  return events.filter(event => {
    const aTag = event.tags.find(tag => tag[0] === 'a');
    return aTag && aTag[1] === groupId;
  });
}
```

### Find Mentions

```typescript
async function findMentions(env: Env, npub: string, since: number) {
  const events = await getRecentEvents(env, 1, since);
  
  return events.filter(event => {
    // Check p tags
    const mentioned = event.tags.some(tag => 
      tag[0] === 'p' && nip19.npubEncode(tag[1]) === npub
    );
    
    // Check content
    const inContent = event.content.includes(`nostr:${npub}`);
    
    return mentioned || inContent;
  });
}
```

## Monitoring and Debugging

### Check Crawl Status

```bash
# View crawler health
curl https://relay-crawler.your.workers.dev/health

# View detailed stats
curl https://relay-crawler.your.workers.dev/stats
```

### Monitor Event Flow

```typescript
// Add to your worker
async function getEventFlowStats(env: Env) {
  const stats = {
    totalEvents: 0,
    eventsByKind: {},
    recentEvents: 0,
    oldestEvent: null,
    newestEvent: null
  };
  
  // Count events by kind
  for (const kind of [0, 1, 7, 11, 1111, 4550, 4551]) {
    const count = await env.KV.list({
      prefix: `index:kind:${kind}:`,
      limit: 1000
    });
    stats.eventsByKind[kind] = count.keys.length;
    stats.totalEvents += count.keys.length;
  }
  
  return stats;
}
```

### Debug Event Processing

```bash
# Watch crawler logs
wrangler tail -c wrangler-crawler.toml

# Watch notification logs  
wrangler tail -c wrangler.toml

# Filter for specific events
wrangler tail -c wrangler-crawler.toml --filter "event:abc123"
```

## Performance Tips

1. **Batch KV Operations**: Use `Promise.all()` for parallel reads
2. **Use Indexes**: Always query through indexes, not by scanning
3. **Set TTLs**: Use expiration to prevent unlimited growth
4. **Monitor Limits**: Track KV operations to stay within limits
5. **Cache Results**: Use Worker cache API for frequently accessed data

## Error Handling

Always handle KV failures gracefully:

```typescript
async function safeKVGet(env: Env, key: string, type = 'text') {
  try {
    return await env.KV.get(key, type);
  } catch (error) {
    console.error(`KV get error for ${key}:`, error);
    return null;
  }
}
```