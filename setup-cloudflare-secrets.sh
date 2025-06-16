#!/bin/bash

# Cloudflare Credentials Setup Helper
# This will guide you through getting the required credentials

echo "🔐 Cloudflare Credentials Setup"
echo "=============================="
echo ""
echo "We need to set up 3 GitHub secrets for Cloudflare deployment:"
echo "1. CF_ACCOUNT_ID"
echo "2. CF_ACCOUNT_SUBDOMAIN" 
echo "3. CF_API_TOKEN"
echo ""

# Function to open URL
open_url() {
    if command -v open &> /dev/null; then
        open "$1"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$1"
    else
        echo "Please open this URL manually: $1"
    fi
}

echo "📋 Step 1: Get your Account ID"
echo "------------------------------"
echo "Opening Cloudflare dashboard..."
open_url "https://dash.cloudflare.com/"
echo ""
echo "Look for 'Account ID' in the right sidebar of your dashboard"
echo "It looks like: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
echo ""
echo "Enter your Account ID:"
read -r ACCOUNT_ID

echo ""
echo "📋 Step 2: Get your Workers subdomain"
echo "------------------------------------"
echo "In the Cloudflare dashboard, click on 'Workers & Pages'"
echo "Your subdomain is the part before .workers.dev"
echo "For example, if your workers are at 'myaccount.workers.dev', enter 'myaccount'"
echo ""
echo "Enter your subdomain (without .workers.dev):"
read -r SUBDOMAIN

echo ""
echo "📋 Step 3: Create API Token"
echo "--------------------------"
echo "Opening API tokens page..."
open_url "https://dash.cloudflare.com/profile/api-tokens"
echo ""
echo "1. Click 'Create Token'"
echo "2. Use the 'Edit Cloudflare Workers' template"
echo "3. Configure permissions:"
echo "   - Account → Cloudflare Workers Scripts: Edit"
echo "   - Account → Account Settings: Read"
echo "4. Click 'Continue to summary'"
echo "5. Click 'Create Token'"
echo "6. COPY THE TOKEN - you'll only see it once!"
echo ""
echo "Enter your API Token:"
read -rs API_TOKEN

echo ""
echo "🔄 Setting GitHub secrets..."

# Set the secrets
echo "${ACCOUNT_ID}" | gh secret set CF_ACCOUNT_ID --repo andotherstuff/chorus
echo "✅ CF_ACCOUNT_ID set"

echo "${SUBDOMAIN}" | gh secret set CF_ACCOUNT_SUBDOMAIN --repo andotherstuff/chorus
echo "✅ CF_ACCOUNT_SUBDOMAIN set"

echo "${API_TOKEN}" | gh secret set CF_API_TOKEN --repo andotherstuff/chorus
echo "✅ CF_API_TOKEN set"

echo ""
echo "🔒 Optional: Set authentication tokens for manual triggers?"
echo "This adds an extra layer of security for manual crawl triggers."
echo "Set auth tokens? (y/n):"
read -r SET_AUTH

if [[ "$SET_AUTH" =~ ^[Yy]$ ]]; then
    # Generate random tokens
    PROD_TOKEN=$(openssl rand -base64 32)
    STAGING_TOKEN=$(openssl rand -base64 32)
    
    echo "${PROD_TOKEN}" | gh secret set WORKER_AUTH_TOKEN_PRODUCTION --repo andotherstuff/chorus
    echo "${STAGING_TOKEN}" | gh secret set WORKER_AUTH_TOKEN_STAGING --repo andotherstuff/chorus
    
    echo ""
    echo "✅ Authentication tokens set!"
    echo ""
    echo "Save these tokens for manual API calls:"
    echo "----------------------------------------"
    echo "Production Token: ${PROD_TOKEN}"
    echo "Staging Token: ${STAGING_TOKEN}"
    echo "----------------------------------------"
fi

echo ""
echo "✅ All secrets configured!"
echo ""
echo "Your relay crawler will be available at:"
echo "- Production: https://relay-crawler-prod.${SUBDOMAIN}.workers.dev"
echo "- Staging: https://relay-crawler-staging.${SUBDOMAIN}.workers.dev"
echo ""
echo "Next steps:"
echo "1. Merge PR #318"
echo "2. Run the setup workflow to create KV namespaces"
echo "3. Update wrangler-crawler.toml with KV IDs"
echo "4. Push to deploy!"