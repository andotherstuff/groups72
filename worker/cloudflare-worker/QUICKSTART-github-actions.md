# Relay Crawler - GitHub Actions Quick Start

Deploy the Nostr Relay Crawler to Cloudflare Workers with GitHub Actions in 5 minutes.

## Prerequisites

- GitHub repository with the relay crawler code
- Cloudflare account (free tier works)
- 5 minutes ⏱️

## Step 1: Get Cloudflare Credentials (2 min)

### 1.1 Get Account ID
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select any domain (or Workers tab)
3. Find your Account ID in the right sidebar
4. Copy it

### 1.2 Create API Token
1. Go to [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Custom token" template
4. Set permissions:
   - Account → Cloudflare Workers Scripts:Edit
   - Account → Account Settings:Read
5. Click "Continue to summary" → "Create Token"
6. Copy the token (you won't see it again!)

### 1.3 Get Workers Subdomain
1. Go to [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers)
2. Your subdomain is shown as `*.YOUR-SUBDOMAIN.workers.dev`
3. Copy just the `YOUR-SUBDOMAIN` part

## Step 2: Add GitHub Secrets (2 min)

Go to your GitHub repo → Settings → Secrets and variables → Actions

Add these secrets (click "New repository secret" for each):

| Secret Name | Value |
|------------|-------|
| `CF_API_TOKEN` | Your API token from Step 1.2 |
| `CF_ACCOUNT_ID` | Your Account ID from Step 1.1 |
| `CF_ACCOUNT_SUBDOMAIN` | Your subdomain from Step 1.3 |

## Step 3: Run Setup Workflow (1 min)

1. Go to Actions tab in your GitHub repo
2. Find "Setup Relay Crawler" workflow
3. Click "Run workflow"
4. Keep both checkboxes checked
5. Click green "Run workflow" button

Wait ~30 seconds for it to complete ✅

## Step 4: Update Configuration

1. In the completed workflow, click to view details
2. Download the `relay-crawler-config` artifact
3. Open `setup-results.md` from the artifact
4. Copy the KV namespace IDs
5. Update `worker/cloudflare-worker/wrangler-crawler.toml`:

```toml
# Replace these with your actual IDs from setup-results.md
[[kv_namespaces]]
binding = "KV"
id = "your-actual-development-kv-id"
preview_id = "your-actual-development-preview-id"

[[env.production.kv_namespaces]]
binding = "KV"
id = "your-actual-production-kv-id"

[[env.staging.kv_namespaces]]
binding = "KV"
id = "your-actual-staging-kv-id"
```

6. Commit and push:
```bash
git add worker/cloudflare-worker/wrangler-crawler.toml
git commit -m "Configure KV namespaces for relay crawler"
git push
```

## 🎉 Done!

The relay crawler will now:
- Deploy automatically when you push to main
- Start crawling relays every minute
- Store events in Cloudflare KV

## Verify It's Working

After ~2 minutes, check your crawler:

```bash
curl https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/health
```

You should see:
```json
{
  "status": "ok",
  "service": "relay-crawler",
  "lastCrawl": "1702934400000",
  "stats": {
    "totalEvents": 127,
    "successfulRelays": 5,
    "totalRelays": 5
  }
}
```

## Monitor Your Crawler

View live logs:
```bash
npx wrangler tail --env production -c worker/cloudflare-worker/wrangler-crawler.toml
```

Or check the [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → relay-crawler-prod

## Troubleshooting

### "Authentication error" in GitHub Actions
- Double-check your CF_API_TOKEN secret
- Make sure you copied the entire token
- Verify the token has the required permissions

### "KV namespace not found"
- Make sure you updated wrangler-crawler.toml with the correct IDs
- The IDs should be long strings like `a1b2c3d4e5f6...`

### Crawler deployed but no data
- Wait 2-3 minutes for the first crawl
- Check logs: `npx wrangler tail --env production -c worker/cloudflare-worker/wrangler-crawler.toml`
- Verify relays are accessible

## Next Steps

- **Customize relays**: Edit `RELAY_URLS` in wrangler-crawler.toml
- **Change schedule**: Modify `crons = ["* * * * *"]` (currently every minute)
- **Add authentication**: Set `WORKER_AUTH_TOKEN_PRODUCTION` secret
- **Monitor usage**: Check Cloudflare dashboard for KV operations

## Manual Deployment

Trigger deployment anytime:
1. Go to Actions tab
2. Select "Deploy Relay Crawler"
3. Click "Run workflow"
4. Choose environment
5. Click "Run workflow"

---

Need help? Check the [full documentation](README-github-actions.md) or open an issue!