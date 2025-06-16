# Relay Crawler Deployment Checklist 🚀

## Prerequisites

### 1. ✅ Code is Ready
- Worker code: `worker/cloudflare-worker/src/relay-crawler-worker.ts`
- GitHub Actions workflows: `.github/workflows/deploy-relay-crawler.yml` and `setup-relay-crawler.yml`
- Configuration: `wrangler-crawler.toml` (needs KV IDs)

### 2. ❓ GitHub Secrets Required
Check if these secrets are set at https://github.com/rabble/chorus/settings/secrets/actions:

- [ ] `CF_API_TOKEN` - Cloudflare API token
- [ ] `CF_ACCOUNT_ID` - Your Cloudflare account ID
- [ ] `CF_ACCOUNT_SUBDOMAIN` - Your workers.dev subdomain (e.g., "your-account")
- [ ] `WORKER_AUTH_TOKEN_PRODUCTION` (optional) - For manual trigger auth
- [ ] `WORKER_AUTH_TOKEN_STAGING` (optional) - For manual trigger auth

## Step-by-Step Setup

### Step 1: Get Cloudflare Credentials

1. **Get Account ID**:
   - Go to https://dash.cloudflare.com/
   - Right sidebar shows "Account ID"
   - Copy this value

2. **Get Workers Subdomain**:
   - Go to Workers & Pages in Cloudflare
   - Your subdomain is `[account-name].workers.dev`
   - Only need the `[account-name]` part

3. **Create API Token**:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template
   - Permissions needed:
     - Account: Cloudflare Workers Scripts: Edit
     - Account: Account Settings: Read
   - Create and copy the token

### Step 2: Add GitHub Secrets

```bash
# Using GitHub CLI (if you have it):
gh secret set CF_API_TOKEN
# Paste your token when prompted

gh secret set CF_ACCOUNT_ID
# Paste your account ID

gh secret set CF_ACCOUNT_SUBDOMAIN
# Enter your subdomain (without .workers.dev)

# Optional: Add auth tokens
gh secret set WORKER_AUTH_TOKEN_PRODUCTION
gh secret set WORKER_AUTH_TOKEN_STAGING
```

Or manually at: https://github.com/rabble/chorus/settings/secrets/actions/new

### Step 3: Run Setup Workflow

1. Go to: https://github.com/rabble/chorus/actions/workflows/setup-relay-crawler.yml
2. Click "Run workflow"
3. Select options:
   - ✅ Create KV namespaces
   - ✅ Test Cloudflare connection
4. Click "Run workflow"
5. Wait for completion (~1 minute)
6. Download the artifact with KV namespace IDs

### Step 4: Update Configuration

1. From the downloaded artifact, copy the KV namespace IDs
2. Update `worker/cloudflare-worker/wrangler-crawler.toml`:

```toml
# Development
[[kv_namespaces]]
binding = "KV"
id = "YOUR_DEV_KV_ID_HERE"
preview_id = "YOUR_DEV_PREVIEW_ID_HERE"

# Production
[[env.production.kv_namespaces]]
binding = "KV"
id = "YOUR_PROD_KV_ID_HERE"

# Staging
[[env.staging.kv_namespaces]]
binding = "KV"
id = "YOUR_STAGING_KV_ID_HERE"
```

### Step 5: Commit and Deploy

```bash
git add worker/cloudflare-worker/wrangler-crawler.toml
git commit -m "Add KV namespace IDs for relay crawler"
git push origin main
```

This will automatically trigger the deployment!

### Step 6: Verify Deployment

1. **Check GitHub Actions**:
   - Go to Actions tab
   - Watch the "Deploy Relay Crawler" workflow
   - Should show green checkmarks

2. **Test the endpoints**:

```bash
# Health check
curl https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/health

# Statistics
curl https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/stats

# Manual trigger (if auth token is set)
curl -X POST https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev/trigger \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

3. **Monitor logs**:

```bash
cd worker/cloudflare-worker
npx wrangler tail --env production -c wrangler-crawler.toml
```

## Testing Checklist

- [ ] Health endpoint returns 200 OK
- [ ] Stats endpoint shows relay information
- [ ] Cron is running (check Cloudflare dashboard)
- [ ] Events are being stored in KV (check stats)
- [ ] No errors in logs

## Troubleshooting

### "Missing CF_* secrets"
- Make sure all three secrets are added in GitHub
- Check spelling matches exactly

### "KV namespace not found"
- Run the setup workflow first
- Make sure you copied the IDs correctly

### "Worker not updating"
- Check if the GitHub Action ran successfully
- Look for error messages in the workflow logs

### "Authentication failed"
- Verify API token permissions
- Check account ID is correct

## Success! 🎉

Once deployed, your relay crawler will:
- Run every minute automatically
- Store events from configured relays
- Be accessible at `https://relay-crawler-prod.YOUR-SUBDOMAIN.workers.dev`
- Auto-deploy on future pushes to main

## Next Steps

1. Monitor performance in Cloudflare dashboard
2. Adjust relay URLs if needed
3. Configure authentication tokens for security
4. Integrate with notification system