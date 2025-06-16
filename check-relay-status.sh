#!/bin/bash

# Relay Crawler Status Check
# This script checks the current status of your relay crawler setup

echo "🔍 Relay Crawler Setup Status Check"
echo "==================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Check files
echo "📁 File Status:"
echo "--------------"
FILES=(
    ".github/workflows/deploy-relay-crawler.yml|Deploy workflow"
    ".github/workflows/setup-relay-crawler.yml|Setup workflow"
    "worker/cloudflare-worker/src/relay-crawler-worker.ts|Worker code"
    "worker/cloudflare-worker/wrangler-crawler.toml|Wrangler config"
)

for file_desc in "${FILES[@]}"; do
    IFS='|' read -r file desc <<< "$file_desc"
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $desc${NC}"
    else
        echo -e "${RED}❌ $desc${NC}"
    fi
done
echo ""

# 2. Check Git status
echo "📍 Git Status:"
echo "-------------"
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"

if git diff --cached --name-only | grep -q "relay-crawler"; then
    echo -e "${YELLOW}⚠️  Relay crawler files are staged${NC}"
elif git diff --name-only | grep -q "relay-crawler"; then
    echo -e "${YELLOW}⚠️  Relay crawler files have uncommitted changes${NC}"
else
    echo -e "${GREEN}✅ Relay crawler files are committed${NC}"
fi

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "No remote")
echo "Remote: $REMOTE_URL"
echo ""

# 3. Check GitHub secrets (if gh is available)
if command -v gh &> /dev/null; then
    echo "🔐 GitHub Secrets:"
    echo "-----------------"
    
    REPO=$(echo "$REMOTE_URL" | sed 's/.*github.com[:\/]\(.*\)\.git/\1/')
    
    if gh auth status &> /dev/null; then
        SECRETS=$(gh secret list --repo "$REPO" 2>/dev/null | awk '{print $1}' || echo "")
        
        REQUIRED_SECRETS=("CF_API_TOKEN" "CF_ACCOUNT_ID" "CF_ACCOUNT_SUBDOMAIN")
        OPTIONAL_SECRETS=("WORKER_AUTH_TOKEN_PRODUCTION" "WORKER_AUTH_TOKEN_STAGING")
        
        for secret in "${REQUIRED_SECRETS[@]}"; do
            if echo "$SECRETS" | grep -q "^$secret$"; then
                echo -e "${GREEN}✅ $secret (required)${NC}"
            else
                echo -e "${RED}❌ $secret (required)${NC}"
            fi
        done
        
        for secret in "${OPTIONAL_SECRETS[@]}"; do
            if echo "$SECRETS" | grep -q "^$secret$"; then
                echo -e "${GREEN}✅ $secret (optional)${NC}"
            else
                echo -e "${YELLOW}⚠️  $secret (optional)${NC}"
            fi
        done
    else
        echo -e "${YELLOW}Not authenticated with GitHub CLI${NC}"
    fi
else
    echo "GitHub CLI not installed - can't check secrets"
fi
echo ""

# 4. Check KV namespace configuration
echo "🗄️  KV Configuration:"
echo "-------------------"
if [ -f "worker/cloudflare-worker/wrangler-crawler.toml" ]; then
    if grep -q "YOUR_KV_NAMESPACE_ID" worker/cloudflare-worker/wrangler-crawler.toml; then
        echo -e "${RED}❌ KV namespace IDs not configured${NC}"
        echo "   Run the setup workflow first to get namespace IDs"
    else
        echo -e "${GREEN}✅ KV namespace IDs appear to be configured${NC}"
    fi
else
    echo -e "${RED}❌ wrangler-crawler.toml not found${NC}"
fi
echo ""

# 5. Summary
echo "📊 Summary:"
echo "----------"
echo "To complete setup:"
echo ""
if [ "$BRANCH" != "main" ]; then
    echo "1. Commit and push relay crawler files"
    echo "2. Create PR to main branch"
    echo "3. After merge, run setup-relay-crawler workflow"
else
    echo "1. Run setup-relay-crawler workflow in GitHub Actions"
fi
echo "2. Update wrangler-crawler.toml with KV namespace IDs"
echo "3. Push changes to trigger deployment"
echo ""
echo "Run './complete-relay-setup.sh' for step-by-step guidance"