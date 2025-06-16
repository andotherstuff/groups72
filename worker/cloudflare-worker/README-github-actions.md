# GitHub Actions Deployment for Relay Crawler

This guide explains how to set up automated deployments of the Relay Crawler using GitHub Actions.

## Overview

The GitHub Actions workflow provides:
- Automated testing on every push
- Staging deployments for pull requests
- Production deployments on merge to main
- Manual deployment triggers
- Health checks after deployment

## Setup Instructions

### 1. Run the Setup Script

```bash
cd worker/cloudflare-worker
./setup-github-actions.sh
```

This script will:
- Create KV namespaces for each environment
- Generate configuration templates
- Guide you through the setup process

### 2. Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Custom token" template with these permissions:
   - **Account** → Cloudflare Workers Scripts:Edit
   - **Account** → Account Settings:Read
   - **Zone** → Zone Settings:Read (if using custom domain)
4. Copy the generated token

### 3. Configure GitHub Secrets

Go to your repository's Settings → Secrets and variables → Actions

Add these secrets:

#### Required Secrets
- `CF_API_TOKEN` - The Cloudflare API token from step 2
- `CF_ACCOUNT_ID` - Your Cloudflare account ID
- `CF_ACCOUNT_SUBDOMAIN` - Your workers.dev subdomain (e.g., "myaccount" from myaccount.workers.dev)

#### Optional Secrets (for authenticated endpoints)
- `WORKER_AUTH_TOKEN_PRODUCTION` - Auth token for production manual triggers
- `WORKER_AUTH_TOKEN_STAGING` - Auth token for staging manual triggers

### 4. Update KV Namespace IDs

Update `wrangler-crawler.toml` with the KV namespace IDs from the setup script:

```toml
# Development/default
[[kv_namespaces]]
binding = "KV"
id = "your-development-kv-id"
preview_id = "your-development-preview-id"

# Production environment
[[env.production.kv_namespaces]]
binding = "KV"
id = "your-production-kv-id"

# Staging environment
[[env.staging.kv_namespaces]]
binding = "KV"
id = "your-staging-kv-id"
```

### 5. Configure GitHub Environments

Go to Settings → Environments and create:

1. **production**
   - Add protection rules (require approval)
   - Add required reviewers
   - Set deployment URL: `https://relay-crawler-prod.$CF_ACCOUNT_SUBDOMAIN.workers.dev`

2. **staging**
   - No protection rules (auto-deploy)
   - Set deployment URL: `https://relay-crawler-staging.$CF_ACCOUNT_SUBDOMAIN.workers.dev`

3. **development**
   - Optional protection rules
   - Set deployment URL: `https://relay-crawler.$CF_ACCOUNT_SUBDOMAIN.workers.dev`

## Workflow Triggers

### Automatic Deployments

1. **Production Deployment**
   - Triggered on push to `main` branch
   - Only when relay crawler files are modified
   - Requires environment approval (if configured)

2. **Staging Deployment**
   - Triggered on pull request
   - Deploys to staging environment
   - Runs health checks

### Manual Deployment

Trigger from Actions tab → Deploy Relay Crawler → Run workflow

Options:
- Choose branch
- Select environment (development/staging/production)

## Deployment Process

1. **Test Phase**
   - Install dependencies
   - Run type checking
   - Run linting

2. **Deploy Phase**
   - Deploy to Cloudflare Workers
   - Set environment secrets
   - Configure cron schedule

3. **Verify Phase**
   - Wait for deployment to propagate
   - Run health check
   - Verify service name

## Monitoring Deployments

### GitHub Actions UI
- View deployment status in Actions tab
- Check deployment logs
- Review environment deployments

### Cloudflare Dashboard
- View worker metrics
- Check cron trigger executions
- Monitor KV usage

### Command Line
```bash
# View production logs
wrangler tail --env production -c wrangler-crawler.toml

# View staging logs
wrangler tail --env staging -c wrangler-crawler.toml

# Check worker status
curl https://relay-crawler-prod.YOUR_SUBDOMAIN.workers.dev/health
```

## Troubleshooting

### Common Issues

1. **KV Namespace Binding Error**
   ```
   Error: Missing binding KV
   ```
   - Ensure KV namespace IDs are correctly set in wrangler-crawler.toml
   - Verify namespace exists: `wrangler kv:namespace list`

2. **Authentication Error**
   ```
   Error: Authentication error
   ```
   - Check CF_API_TOKEN is correctly set
   - Verify token has required permissions
   - Ensure CF_ACCOUNT_ID is correct

3. **Deployment URL 404**
   - Wait 1-2 minutes for deployment to propagate
   - Check worker name matches URL
   - Verify CF_ACCOUNT_SUBDOMAIN is correct

4. **Cron Not Running**
   - Check Cloudflare dashboard for cron triggers
   - Verify cron syntax in wrangler-crawler.toml
   - Check worker logs for errors

### Debug Workflow

1. Enable debug logging:
   ```yaml
   - name: Deploy with debug
     env:
       ACTIONS_STEP_DEBUG: true
   ```

2. Add test steps:
   ```yaml
   - name: Test KV access
     run: |
       wrangler kv:key list --namespace-id=$KV_NAMESPACE_ID
   ```

## Security Best Practices

1. **Secrets Management**
   - Never commit secrets to repository
   - Use different auth tokens per environment
   - Rotate tokens regularly

2. **Environment Protection**
   - Require approval for production
   - Limit who can approve deployments
   - Use environment-specific secrets

3. **Access Control**
   - Restrict who can trigger manual deployments
   - Use branch protection rules
   - Enable audit logging

## Advanced Configuration

### Custom Relay Lists per Environment

```toml
# staging - fewer relays for testing
[env.staging.vars]
RELAY_URLS = "wss://relay.primal.net,wss://relay.damus.io"

# production - all relays
[env.production.vars]
RELAY_URLS = "wss://relay.primal.net,wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol,wss://relay.snort.social,wss://relay.nostr.info"
```

### Deployment Notifications

Add to workflow:
```yaml
- name: Notify Slack
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Relay Crawler deployed to ${{ github.event.inputs.environment || 'production' }}"
      }
```

### Rollback Strategy

```bash
# List deployments
wrangler deployments list -c wrangler-crawler.toml

# Rollback to previous version
wrangler rollback --env production -c wrangler-crawler.toml
```

## Costs

GitHub Actions:
- 2,000 minutes/month free for private repos
- This workflow uses ~2-3 minutes per run

Cloudflare Workers:
- 100,000 requests/day free
- 1,000,000 KV reads/day free
- Cron triggers: 1/minute = 43,200/month (within limits)

## Getting Help

1. Check workflow logs in GitHub Actions tab
2. Review Cloudflare worker logs
3. Check relay-crawler-github-config.md for your configuration
4. Open an issue with:
   - Workflow run URL
   - Error messages
   - Configuration (without secrets)