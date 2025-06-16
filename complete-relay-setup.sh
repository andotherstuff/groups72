#!/bin/bash

# Relay Crawler Complete Setup Script
# This script will guide you through the entire setup process

set -e

echo "🚀 Relay Crawler - Complete Setup Guide"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"
echo ""

# Step 1: Check GitHub CLI
echo "Step 1: Checking GitHub CLI..."
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI not found${NC}"
    echo "Please install it from: https://cli.github.com/"
    echo "Or run: brew install gh"
    exit 1
fi
echo -e "${GREEN}✅ GitHub CLI found${NC}"

# Check if logged in
if ! gh auth status &> /dev/null; then
    echo "🔐 Please log in to GitHub..."
    gh auth login
fi
echo -e "${GREEN}✅ Authenticated with GitHub${NC}"
echo ""

# Step 2: Get repository info
echo "Step 2: Repository Information"
REPO=$(git remote get-url origin | sed 's/.*github.com[:\/]\(.*\)\.git/\1/')
echo "📦 Repository: $REPO"
echo ""

# Step 3: Check for required files
echo "Step 3: Checking required files..."
REQUIRED_FILES=(
    ".github/workflows/deploy-relay-crawler.yml"
    ".github/workflows/setup-relay-crawler.yml"
    "worker/cloudflare-worker/src/relay-crawler-worker.ts"
    "worker/cloudflare-worker/wrangler-crawler.toml"
)

ALL_FILES_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ Found: $file${NC}"
    else
        echo -e "${RED}❌ Missing: $file${NC}"
        ALL_FILES_EXIST=false
    fi
done
echo ""

if [ "$ALL_FILES_EXIST" = false ]; then
    echo -e "${RED}Some required files are missing. Please ensure all files are created.${NC}"
    exit 1
fi

# Step 4: Commit workflow files
echo "Step 4: Preparing GitHub Actions workflows..."
echo "Do you want to commit the GitHub Actions workflows? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "Adding workflow files..."
    git add .github/workflows/deploy-relay-crawler.yml
    git add .github/workflows/setup-relay-crawler.yml
    git add .github/workflows/README.md
    git add worker/cloudflare-worker/src/relay-crawler-worker.ts
    git add worker/cloudflare-worker/wrangler-crawler.toml
    
    git commit -m "Add relay crawler GitHub Actions workflows and worker"
    echo -e "${GREEN}✅ Workflows committed${NC}"
    echo ""
    
    echo "Push to remote? (y/n)"
    read -r push_response
    if [[ "$push_response" =~ ^[Yy]$ ]]; then
        git push origin "$CURRENT_BRANCH"
        echo -e "${GREEN}✅ Pushed to $CURRENT_BRANCH${NC}"
    fi
fi
echo ""

# Step 5: Configure secrets
echo "Step 5: Configuring GitHub Secrets..."
echo "We need to set up the following secrets:"
echo "- CF_API_TOKEN"
echo "- CF_ACCOUNT_ID"
echo "- CF_ACCOUNT_SUBDOMAIN"
echo ""

# Check existing secrets
echo "Checking existing secrets..."
EXISTING_SECRETS=$(gh secret list --repo "$REPO" 2>/dev/null | awk '{print $1}' || echo "")

check_secret() {
    local secret=$1
    if echo "$EXISTING_SECRETS" | grep -q "^$secret$"; then
        echo -e "${GREEN}✅ $secret already exists${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  $secret not found${NC}"
        return 1
    fi
}

# Check each required secret
SECRETS_NEEDED=false
for secret in CF_API_TOKEN CF_ACCOUNT_ID CF_ACCOUNT_SUBDOMAIN; do
    if ! check_secret "$secret"; then
        SECRETS_NEEDED=true
    fi
done
echo ""

if [ "$SECRETS_NEEDED" = true ]; then
    echo "Would you like to set up the missing secrets now? (y/n)"
    read -r setup_secrets
    
    if [[ "$setup_secrets" =~ ^[Yy]$ ]]; then
        echo ""
        echo "📋 Instructions to get Cloudflare credentials:"
        echo ""
        echo "1. Get Account ID:"
        echo "   - Go to https://dash.cloudflare.com/"
        echo "   - Find 'Account ID' in the right sidebar"
        echo ""
        echo "2. Get Workers Subdomain:"
        echo "   - Go to Workers & Pages in Cloudflare"
        echo "   - Your subdomain is the part before .workers.dev"
        echo ""
        echo "3. Create API Token:"
        echo "   - Go to https://dash.cloudflare.com/profile/api-tokens"
        echo "   - Click 'Create Token'"
        echo "   - Use 'Edit Cloudflare Workers' template"
        echo "   - Add permissions: Workers Scripts: Edit, Account Settings: Read"
        echo ""
        echo "Press Enter when ready to continue..."
        read -r
        
        # Set secrets one by one
        if ! check_secret "CF_ACCOUNT_ID"; then
            echo "Enter your Cloudflare Account ID:"
            read -r account_id
            echo "$account_id" | gh secret set CF_ACCOUNT_ID --repo "$REPO"
            echo -e "${GREEN}✅ CF_ACCOUNT_ID set${NC}"
        fi
        
        if ! check_secret "CF_ACCOUNT_SUBDOMAIN"; then
            echo "Enter your Workers subdomain (without .workers.dev):"
            read -r subdomain
            echo "$subdomain" | gh secret set CF_ACCOUNT_SUBDOMAIN --repo "$REPO"
            echo -e "${GREEN}✅ CF_ACCOUNT_SUBDOMAIN set${NC}"
        fi
        
        if ! check_secret "CF_API_TOKEN"; then
            echo "Enter your Cloudflare API Token:"
            read -rs api_token
            echo "$api_token" | gh secret set CF_API_TOKEN --repo "$REPO"
            echo -e "${GREEN}✅ CF_API_TOKEN set${NC}"
        fi
        
        # Optional auth tokens
        echo ""
        echo "Do you want to set up authentication tokens for manual triggers? (y/n)"
        read -r setup_auth
        if [[ "$setup_auth" =~ ^[Yy]$ ]]; then
            # Generate tokens
            PROD_TOKEN=$(openssl rand -base64 32)
            STAGING_TOKEN=$(openssl rand -base64 32)
            
            echo "$PROD_TOKEN" | gh secret set WORKER_AUTH_TOKEN_PRODUCTION --repo "$REPO"
            echo "$STAGING_TOKEN" | gh secret set WORKER_AUTH_TOKEN_STAGING --repo "$REPO"
            
            echo -e "${GREEN}✅ Authentication tokens set${NC}"
            echo ""
            echo "Save these tokens for manual trigger authentication:"
            echo "Production: $PROD_TOKEN"
            echo "Staging: $STAGING_TOKEN"
        fi
    fi
fi

# Step 6: Next steps
echo ""
echo "================================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. If on a feature branch, create a PR to main:"
echo "   gh pr create --title 'Add relay crawler' --body 'Adds relay crawler worker and GitHub Actions'"
echo ""
echo "2. After merging to main, run the setup workflow:"
echo "   gh workflow run setup-relay-crawler.yml"
echo ""
echo "3. Download the KV namespace IDs from the workflow artifact"
echo ""
echo "4. Update wrangler-crawler.toml with the KV IDs and push"
echo ""
echo "5. The crawler will deploy automatically!"
echo ""
echo "For detailed instructions, see: RELAY_CRAWLER_DEPLOYMENT_CHECKLIST.md"