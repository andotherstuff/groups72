# Cloudflare Configuration - Relay Crawler

## Account Information
- **Account Name**: Nos Verse
- **Account ID**: c84e7a9bf7ed99cb41b8e73566568c75
- **Workers Subdomain**: protestnet
- **Email**: rabble@verse.app

## GitHub Secrets to Add

Go to: https://github.com/[your-username]/groups72/settings/secrets/actions

Add these repository secrets:

```
CF_ACCOUNT_SUBDOMAIN: protestnet
CF_ACCOUNT_ID: c84e7a9bf7ed99cb41b8e73566568c75
CF_API_TOKEN: [YOUR_API_TOKEN]
```

## Worker URLs

Once deployed, your relay crawler will be available at:

- **Production**: https://relay-crawler-prod.protestnet.workers.dev
- **Staging**: https://relay-crawler-staging.protestnet.workers.dev
- **Development**: https://relay-crawler.protestnet.workers.dev

## Health Check URLs

Test your deployment:

```bash
# Production
curl https://relay-crawler-prod.protestnet.workers.dev/health

# Staging
curl https://relay-crawler-staging.protestnet.workers.dev/health

# Development
curl https://relay-crawler.protestnet.workers.dev/health
```

## Next Steps

1. Add the GitHub secrets listed above
2. Run the Setup workflow: Actions → Setup Relay Crawler → Run workflow
3. Update wrangler-crawler.toml with the KV namespace IDs
4. Commit and push to trigger deployment

## Monitor Commands

```bash
# View production logs
wrangler tail --env production -c wrangler-crawler.toml

# View staging logs
wrangler tail --env staging -c wrangler-crawler.toml

# View development logs
wrangler tail -c wrangler-crawler.toml
```

---
**Note**: Keep your API token secure. Never commit it to the repository.