# Relay Crawler - GitHub Actions Setup Complete ✅

## What We've Created

### 1. Relay Crawler Worker (`src/relay-crawler-worker.ts`)
A Cloudflare Worker that:
- Runs every minute automatically
- Crawls multiple Nostr relays in parallel
- Stores events in Cloudflare KV with 7-day TTL
- Provides health check and statistics endpoints

### 2. GitHub Actions Workflows

#### Deploy Workflow (`.github/workflows/deploy-relay-crawler.yml`)
- **Automatic deployments**:
  - Staging: On pull requests
  - Production: On push to main
- **Manual deployments**: Via workflow dispatch
- **Features**:
  - TypeScript compilation checks
  - Health check verification after deployment
  - Environment-specific configurations

#### Setup Workflow (`.github/workflows/setup-relay-crawler.yml`)
- One-click KV namespace creation
- Tests Cloudflare connection
- Generates configuration files
- Provides setup instructions

### 3. Configuration Files

- **`wrangler-crawler.toml`**: Cloudflare Worker configuration
- **`deploy-crawler.sh`**: Local deployment script
- **`setup-github-actions.sh`**: GitHub Actions setup helper
- **`test-relay-crawler.js`**: Testing utility

### 4. Documentation

- **`README-relay-crawler.md`**: Complete relay crawler documentation
- **`README-github-actions.md`**: Detailed GitHub Actions guide
- **`QUICKSTART-github-actions.md`**: 5-minute setup guide
- **`relay-crawler-integration-example.md`**: Integration patterns

## Deployment Instructions

### Quick Start (5 minutes)

1. **Get Cloudflare credentials**:
   - Account ID from dashboard
   - Create API token with Workers permissions
   - Note your workers.dev subdomain

2. **Add GitHub secrets**:
   ```
   CF_API_TOKEN
   CF_ACCOUNT_ID
   CF_ACCOUNT_SUBDOMAIN
   ```

3. **Run setup workflow**:
   - Go to Actions → Setup Relay Crawler → Run workflow
   - Download the config artifact
   - Update `wrangler-crawler.toml` with KV IDs
   - Commit and push

4. **Verify deployment**:
   ```bash
   curl https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/health
   ```

### Features

- **Automatic crawling**: Every minute via Cloudflare Cron
- **Multi-environment**: Development, staging, production
- **Health monitoring**: `/health` endpoint
- **Statistics**: `/stats` endpoint
- **Manual triggers**: `/trigger` endpoint (with optional auth)
- **Event indexing**: By kind and author for fast lookups

### Next Steps

1. **Monitor your crawler**:
   ```bash
   npx wrangler tail --env production -c wrangler-crawler.toml
   ```

2. **Customize configuration**:
   - Edit relay URLs in `wrangler-crawler.toml`
   - Adjust cron schedule if needed
   - Add authentication tokens for security

3. **Integration**:
   - Use crawled events in notification worker
   - Query events by kind or author
   - Build analytics on stored data

### Cost

Within Cloudflare free tier:
- Workers: 100,000 requests/day
- KV: 1,000,000 reads/day
- Cron triggers: Unlimited

## Support

Check logs if issues arise:
```bash
# View crawler logs
wrangler tail --env production -c wrangler-crawler.toml

# Check GitHub Actions
# Go to Actions tab in your repository

# Test endpoints
curl https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/health
curl https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/stats
```