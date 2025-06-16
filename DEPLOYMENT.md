# Automated Deployment with GitHub Actions

[![Deploy to Production](https://github.com/YOUR-USERNAME/YOUR-REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR-USERNAME/YOUR-REPO/actions/workflows/deploy.yml)

This project automatically deploys to Cloudflare Workers on every push to the `main` branch.

## 🚀 Quick Start

1. **Run the setup script**:
   ```bash
   ./setup-github-actions.sh
   ```
   This will guide you through configuring all required secrets.

2. **Run the infrastructure setup** (one time only):
   - Go to the [Actions](../../actions) tab
   - Click "Setup Cloudflare Infrastructure"
   - Click "Run workflow"

3. **Deploy automatically**:
   - Simply push to `main`
   - GitHub Actions will build and deploy everything

## 📋 What Gets Deployed

Every push to `main` triggers:

1. **Frontend Build** → Ready for your CDN/hosting
2. **Cloudflare Worker** → Push notification service
3. **Notification Bot** → Docker image built and ready

## 🔧 Manual Controls

- **Deploy manually**: Actions → Deploy to Production → Run workflow
- **Check deployment**: Look for the green checkmark on commits
- **View logs**: Click on any workflow run for detailed logs
- **Rollback**: Use Cloudflare dashboard or revert commits

## 🔐 Required Secrets

Configure these in Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Deploy to Workers |
| `BOT_TOKEN` | Bot authentication |
| `VAPID_PUBLIC_KEY` | Push notifications |
| `VAPID_PRIVATE_KEY` | Push notifications |

## 📊 Monitoring

- **GitHub Actions**: Real-time deployment logs
- **Cloudflare Dashboard**: Worker performance
- **Worker Logs**: `wrangler tail` or dashboard

## 🚨 Troubleshooting

If deployment fails:
1. Check the [Actions](../../actions) tab for error logs
2. Verify all secrets are configured
3. Ensure wrangler.toml has KV namespace ID
4. Check Cloudflare API token permissions

## 🎯 Best Practices

1. **Test locally first**: `npm run ci`
2. **Use pull requests**: Validates before merging
3. **Monitor after deploy**: Check worker health
4. **Tag releases**: `git tag v1.0.0`

---

For detailed setup instructions, see [.github/workflows/README.md](.github/workflows/README.md)