# GitHub Actions CI/CD Setup

This repository uses GitHub Actions for automated testing, building, and deployment to Cloudflare Workers.

## Workflows

### 1. 🚀 Deploy to Production (`deploy.yml`)
**Triggers**: Every push to `main` branch
**Actions**:
- Builds and tests the React app
- Deploys Cloudflare Worker for push notifications
- Builds notification bot Docker image
- Optionally deploys to GitHub Pages
- Sends deployment notifications

### 2. 🛠️ Setup Cloudflare Infrastructure (`setup.yml`)
**Triggers**: Manual only (run once)
**Actions**:
- Creates Cloudflare KV namespace
- Updates `wrangler.toml` with namespace ID
- Commits changes back to repository

### 3. ✅ Validate Environment (`validate.yml`)
**Triggers**: Pull requests to `main`, manual
**Actions**:
- Checks all required secrets are configured
- Validates configuration files
- Ensures KV namespace is set up

## Initial Setup

### Step 1: Configure GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions | [Create token](https://dash.cloudflare.com/profile/api-tokens) |
| `BOT_TOKEN` | Shared secret for bot authentication | Run: `openssl rand -base64 32` |
| `VAPID_PUBLIC_KEY` | Public key for Web Push | Run: `./generate-vapid-keys.sh` |
| `VAPID_PRIVATE_KEY` | Private key for Web Push | Run: `./generate-vapid-keys.sh` |
| `DISCORD_WEBHOOK` | (Optional) Discord webhook for notifications | Discord server settings |

### Step 2: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Set permissions:
   - Account: Cloudflare Workers Scripts: Edit
   - Account: Account Settings: Read
   - Zone: Workers Routes: Edit
5. Click "Continue to summary" → "Create Token"
6. Copy the token to GitHub Secrets

### Step 3: Run Setup Workflow

1. Go to **Actions** tab
2. Select "Setup Cloudflare Infrastructure"
3. Click "Run workflow"
4. This will create the KV namespace and update `wrangler.toml`

### Step 4: Update Frontend Configuration

Create `.env.production` in your repository:
```env
VITE_WORKER_URL=https://chorus-notifications.YOUR-ACCOUNT.workers.dev
VITE_VAPID_PUBLIC_KEY=${{ secrets.VAPID_PUBLIC_KEY }}
```

## Deployment Process

### Automatic Deployment

Every push to `main` will:
1. Run tests and type checking
2. Build the application
3. Deploy worker to Cloudflare
4. Build notification bot
5. Send success/failure notifications

### Manual Deployment

To manually trigger deployment:
1. Go to **Actions** → "Deploy to Production"
2. Click "Run workflow"
3. Select `main` branch
4. Click "Run workflow"

## Monitoring Deployments

### GitHub Actions Dashboard
- View real-time logs
- Check deployment status
- Download build artifacts

### Cloudflare Dashboard
- Monitor worker performance
- View KV storage usage
- Check error logs

### Notification Bot
The bot Docker image is built but needs to be deployed separately to your hosting platform.

## Troubleshooting

### "KV namespace ID not configured"
Run the "Setup Cloudflare Infrastructure" workflow first.

### "Missing required secrets"
Add all required secrets in GitHub Settings.

### "Deployment failed"
1. Check the workflow logs
2. Verify Cloudflare API token permissions
3. Ensure `wrangler.toml` is properly configured

### Worker not updating
1. Check Cloudflare dashboard for the latest version
2. Clear Cloudflare cache if needed
3. Verify the worker URL in production

## Local Development

To test the workflows locally:
```bash
# Install act (GitHub Actions emulator)
brew install act

# Test the deployment workflow
act push -s CLOUDFLARE_API_TOKEN=your-token

# Test with secrets from .env file
act push --secret-file .env.secrets
```

## Best Practices

1. **Test locally first**: Run `npm run build` before pushing
2. **Use pull requests**: All changes should go through PR workflow
3. **Monitor deployments**: Check the Actions tab after pushing
4. **Keep secrets secure**: Never commit secrets to the repository
5. **Version your worker**: Use git tags for releases

## Rollback Process

If a deployment causes issues:

### Option 1: Cloudflare Dashboard
1. Go to Workers → your-worker
2. Click "Deployments" tab
3. Find previous version
4. Click "Rollback"

### Option 2: Git Revert
```bash
# Revert the problematic commit
git revert <commit-hash>
git push origin main

# This will trigger a new deployment with the reverted code
```

## Cost Considerations

- **GitHub Actions**: 2,000 minutes/month free
- **Cloudflare Workers**: 100,000 requests/day free
- **KV Storage**: 1 GB free
- **Estimated monthly usage**: Well within free tiers

## Security Notes

- API tokens are stored as encrypted secrets
- Worker deployments use secure API authentication
- Bot tokens are rotated regularly
- VAPID keys should be unique per environment

## Future Enhancements

- [ ] Add staging environment workflow
- [ ] Implement automated bot deployment
- [ ] Add performance testing
- [ ] Create rollback workflow
- [ ] Add security scanning