# Relay Crawler Worker

A Cloudflare Worker that crawls Nostr relays every minute to fetch and index events. This worker is designed to run as a scheduled job and collect events from multiple relays for processing and analysis.

## Features

- **Scheduled Crawling**: Runs automatically every minute via Cloudflare Cron Triggers
- **Multi-Relay Support**: Crawls multiple relays in parallel
- **Event Deduplication**: Prevents storing duplicate events
- **Event Indexing**: Indexes events by kind and author for fast lookups
- **Health Monitoring**: Provides health check and statistics endpoints
- **Manual Triggers**: Can be triggered manually for testing
- **Crawl History**: Maintains history of recent crawls with statistics

## Architecture

The crawler:
1. Connects to each configured relay via WebSocket
2. Requests events since the last crawl timestamp
3. Verifies and stores unique events in Cloudflare KV
4. Creates indexes for efficient querying
5. Tracks statistics and crawl history

## Event Types Crawled

- **Group Events** (NIP-29): kinds 9, 10, 11, 12, 9007, 9008
- **User Metadata**: kind 0 (profiles), kind 3 (contacts)
- **Content**: kind 1 (notes), kind 1111 (replies), kind 7 (reactions)
- **Moderation**: kinds 4550 (approved), 4551 (removed)

## Configuration

### Environment Variables

```toml
# Relay URLs to crawl (comma-separated)
RELAY_URLS = "wss://relay.primal.net,wss://relay.damus.io,wss://relay.nostr.band"

# Optional: Authentication token for manual triggers
WORKER_AUTH_TOKEN = "your-secret-token"
```

### Cron Schedule

The worker runs every minute by default:
```toml
[triggers]
crons = ["* * * * *"]  # Every minute
```

To change the frequency, modify the cron expression:
- `*/5 * * * *` - Every 5 minutes
- `*/15 * * * *` - Every 15 minutes
- `0 * * * *` - Every hour

## Deployment

### Prerequisites

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

### Quick Deploy

Use the deployment script:
```bash
./deploy-crawler.sh [environment]
```

Environments: `development` (default), `staging`, `production`

### Manual Deploy

1. Create KV namespace:
```bash
wrangler kv:namespace create "relay_crawler"
wrangler kv:namespace create "relay_crawler_preview" --preview
```

2. Update `wrangler-crawler.toml` with the KV namespace IDs

3. Deploy the worker:
```bash
# Development
wrangler deploy -c wrangler-crawler.toml

# Production
wrangler deploy --env production -c wrangler-crawler.toml
```

4. Set secrets (optional):
```bash
wrangler secret put WORKER_AUTH_TOKEN -c wrangler-crawler.toml
```

## API Endpoints

### Health Check
```bash
GET /health
```

Returns crawler status and last crawl time:
```json
{
  "status": "ok",
  "service": "relay-crawler",
  "lastCrawl": "1703001234567",
  "stats": {
    "lastCrawl": 1703001234567,
    "totalEvents": 523,
    "successfulRelays": 4,
    "totalRelays": 5,
    "avgEventsPerRelay": 130.75,
    "crawlDuration": 12543
  }
}
```

### Manual Trigger
```bash
POST /trigger
Authorization: Bearer YOUR_AUTH_TOKEN
```

Manually triggers a crawl (requires auth token if configured):
```json
{
  "status": "triggered",
  "timestamp": "2024-12-19T10:30:00.000Z"
}
```

### Statistics
```bash
GET /stats
```

Returns detailed crawl statistics:
```json
{
  "currentStats": {
    "lastCrawl": 1703001234567,
    "totalEvents": 523,
    "successfulRelays": 4,
    "totalRelays": 5
  },
  "historyCount": 60
}
```

## Monitoring

### View Logs
```bash
wrangler tail -c wrangler-crawler.toml
```

### View Real-time Logs (Production)
```bash
wrangler tail --env production -c wrangler-crawler.toml
```

## KV Storage Structure

The crawler stores data in KV with the following key patterns:

- `event:{event_id}` - Full event data (7-day TTL)
- `index:kind:{kind}:{event_id}` - Event index by kind
- `index:author:{pubkey}:{event_id}` - Event index by author
- `crawl_stats` - Latest crawl statistics
- `last_crawl_time` - Timestamp of last crawl
- `crawl_history:{timestamp}` - Historical crawl data (1-hour TTL)

## Performance Considerations

- **Timeout**: Each relay has a 30-second timeout
- **Overall Limit**: Total crawl time is limited to 50 seconds
- **CPU Limit**: 50ms CPU time per request
- **Parallel Processing**: All relays are crawled in parallel
- **Event Limits**: Each filter has a limit to prevent overwhelming the worker

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check if relay URL is correct and accessible
   - Some relays may have connection limits

2. **Timeout Errors**
   - Reduce the number of events requested per filter
   - Remove slow or unresponsive relays

3. **KV Storage Errors**
   - Ensure KV namespace is properly bound
   - Check KV storage limits haven't been exceeded

### Debug Mode

To see detailed logs during development:
```bash
wrangler dev -c wrangler-crawler.toml --local
```

## Integration with Other Workers

The relay crawler stores events that can be consumed by other workers:

1. **Notification Worker**: Can query stored events for notification triggers
2. **Analytics Worker**: Can process indexed events for statistics
3. **API Worker**: Can serve stored events to clients

Example of reading crawled events:
```typescript
// Get specific event
const event = await env.KV.get(`event:${eventId}`, 'json');

// List events by kind
const kindIndex = await env.KV.list({ prefix: `index:kind:1:` });

// List events by author
const authorIndex = await env.KV.list({ prefix: `index:author:${pubkey}:` });
```

## Cost Estimation

Based on Cloudflare Workers pricing:

- **Scheduled Invocations**: 1 per minute = ~43,200/month
- **KV Operations**: Depends on event volume
- **Typical Usage**: Well within free tier limits

## Security

- WebSocket connections are authenticated using NIP-42 when supported
- Manual trigger endpoint requires authentication token
- Events are verified using Nostr signature verification
- No private keys are stored or handled

## Future Enhancements

- [ ] Support for NIP-42 AUTH
- [ ] Configurable event filters per relay
- [ ] Event streaming to Durable Objects
- [ ] Metrics export to external monitoring
- [ ] Dynamic relay health scoring
- [ ] Event processing pipelines