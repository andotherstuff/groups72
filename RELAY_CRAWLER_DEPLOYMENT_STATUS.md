# 🎉 Relay Crawler Deployment Progress

## ✅ Completed Steps

### 1. Code Committed and Pushed
- Added relay crawler worker (`src/relay-crawler-worker.ts`)
- Added GitHub Actions workflows
- Added configuration files
- Committed to `notification_worker` branch

### 2. Pull Request Created
- PR #318: https://github.com/andotherstuff/chorus/pull/318
- Ready for review and merge

### 3. GitHub Secrets Configured
- ✅ `CF_ACCOUNT_ID` - Set at 2025-05-23T21:15:31Z
- ✅ `CF_ACCOUNT_SUBDOMAIN` - Set at 2025-05-23T21:15:32Z  
- ✅ `CF_API_TOKEN` - Set at 2025-05-23T21:15:33Z

## 📋 Next Steps

### Step 1: Merge the PR
Go to https://github.com/andotherstuff/chorus/pull/318 and merge it.

### Step 2: Run Setup Workflow
After merging:
1. Go to: https://github.com/andotherstuff/chorus/actions/workflows/setup-relay-crawler.yml
2. Click "Run workflow"
3. Select main branch
4. Enable both options:
   - ✅ Create KV namespaces
   - ✅ Test Cloudflare connection
5. Click "Run workflow"

### Step 3: Get KV Namespace IDs
1. Wait for the setup workflow to complete (~1 minute)
2. Click on the completed workflow run
3. Download the "relay-crawler-config" artifact
4. Open the downloaded file to find your KV namespace IDs

### Step 4: Update Configuration
1. Edit `worker/cloudflare-worker/wrangler-crawler.toml`
2. Replace the placeholder IDs with your actual KV namespace IDs:
   ```toml
   # Development
   [[kv_namespaces]]
   binding = "KV"
   id = "YOUR_ACTUAL_DEV_ID_HERE"
   preview_id = "YOUR_ACTUAL_PREVIEW_ID_HERE"

   # Production
   [[env.production.kv_namespaces]]
   binding = "KV"
   id = "YOUR_ACTUAL_PROD_ID_HERE"

   # Staging
   [[env.staging.kv_namespaces]]
   binding = "KV"
   id = "YOUR_ACTUAL_STAGING_ID_HERE"
   ```

### Step 5: Commit and Deploy
```bash
git add worker/cloudflare-worker/wrangler-crawler.toml
git commit -m "Add KV namespace IDs for relay crawler"
git push origin main
```

This will automatically trigger the deployment!

### Step 6: Verify Deployment
Once deployed, test your endpoints:
```bash
# Replace YOUR_SUBDOMAIN with your actual subdomain
curl https://relay-crawler-prod.YOUR_SUBDOMAIN.workers.dev/health
curl https://relay-crawler-prod.YOUR_SUBDOMAIN.workers.dev/stats
```

## 🔍 Monitoring

- **GitHub Actions**: Check deployment status at https://github.com/andotherstuff/chorus/actions
- **Cloudflare Dashboard**: Monitor worker performance and logs
- **Cron Jobs**: Will run every minute automatically

## 📝 Important URLs

- PR: https://github.com/andotherstuff/chorus/pull/318
- Setup Workflow: https://github.com/andotherstuff/chorus/actions/workflows/setup-relay-crawler.yml
- Deploy Workflow: https://github.com/andotherstuff/chorus/actions/workflows/deploy-relay-crawler.yml
- Repository: https://github.com/andotherstuff/chorus

## ⏱️ Timeline

- Code pushed: ✅ Done
- PR created: ✅ Done
- Secrets configured: ✅ Done
- Waiting for: PR merge
- Then: Run setup workflow → Update KV IDs → Deploy automatically