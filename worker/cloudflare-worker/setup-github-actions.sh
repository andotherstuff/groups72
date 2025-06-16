#!/bin/bash

# Setup script for Relay Crawler GitHub Actions deployment
# This script helps create KV namespaces and prepare for GitHub Actions

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Relay Crawler GitHub Actions Setup${NC}"
echo -e "${YELLOW}This script will help you set up KV namespaces and prepare for GitHub Actions deployment${NC}\n"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ wrangler CLI not found. Please install it first:${NC}"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if logged in to Cloudflare
echo -e "${YELLOW}Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Cloudflare${NC}"
    echo "Please run: wrangler login"
    exit 1
fi

# Get account info
ACCOUNT_INFO=$(wrangler whoami 2>&1 | grep -E "Account ID|Account Name" || true)
echo -e "${GREEN}✅ Logged in to Cloudflare${NC}"
echo "$ACCOUNT_INFO"

# Function to create KV namespace
create_kv_namespace() {
    local name=$1
    local env=$2
    
    echo -e "\n${YELLOW}Creating KV namespace: ${name}${NC}"
    
    # Create the namespace
    output=$(wrangler kv:namespace create "$name" 2>&1)
    echo "$output"
    
    # Extract the ID
    id=$(echo "$output" | grep -oE 'id = "[^"]*"' | cut -d'"' -f2)
    
    if [ -n "$id" ]; then
        echo -e "${GREEN}✅ Created KV namespace ${name} with ID: ${id}${NC}"
        echo "${env}_KV_ID=${id}" >> kv_ids.txt
    else
        echo -e "${RED}❌ Failed to extract KV namespace ID${NC}"
        return 1
    fi
    
    # Create preview namespace
    echo -e "${YELLOW}Creating preview namespace: ${name}_preview${NC}"
    preview_output=$(wrangler kv:namespace create "${name}" --preview 2>&1)
    echo "$preview_output"
    
    preview_id=$(echo "$preview_output" | grep -oE 'id = "[^"]*"' | cut -d'"' -f2)
    
    if [ -n "$preview_id" ]; then
        echo -e "${GREEN}✅ Created preview namespace with ID: ${preview_id}${NC}"
        echo "${env}_KV_PREVIEW_ID=${preview_id}" >> kv_ids.txt
    fi
}

# Create KV namespaces
echo -e "\n${BLUE}=== Creating KV Namespaces ===${NC}"
echo -e "${YELLOW}We'll create KV namespaces for each environment${NC}"

# Clear previous IDs file
> kv_ids.txt

# Production namespace
read -p "Create production KV namespace? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    create_kv_namespace "relay_crawler_production" "PRODUCTION"
fi

# Staging namespace
read -p "Create staging KV namespace? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    create_kv_namespace "relay_crawler_staging" "STAGING"
fi

# Development namespace
read -p "Create development KV namespace? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    create_kv_namespace "relay_crawler_development" "DEVELOPMENT"
fi

# Update wrangler configuration
echo -e "\n${BLUE}=== Updating Configuration ===${NC}"
echo -e "${YELLOW}Now we need to update wrangler-crawler.toml with the KV namespace IDs${NC}"

if [ -f kv_ids.txt ]; then
    echo -e "\n${GREEN}KV Namespace IDs:${NC}"
    cat kv_ids.txt
    
    echo -e "\n${YELLOW}Please update wrangler-crawler.toml with these IDs${NC}"
    echo "Replace the placeholder IDs in the configuration file"
fi

# Generate API token
echo -e "\n${BLUE}=== Cloudflare API Token ===${NC}"
echo -e "${YELLOW}You need to create a Cloudflare API token for GitHub Actions${NC}"
echo -e "${YELLOW}Go to: https://dash.cloudflare.com/profile/api-tokens${NC}"
echo -e "${YELLOW}Create a token with these permissions:${NC}"
echo "  - Account: Cloudflare Workers Scripts:Edit"
echo "  - Account: Account Settings:Read"
echo "  - Zone: Zone Settings:Read (optional, if using custom domain)"

read -p "Have you created the API token? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${BLUE}=== GitHub Secrets ===${NC}"
    echo -e "${YELLOW}Add these secrets to your GitHub repository:${NC}"
    echo -e "${YELLOW}Go to: Settings → Secrets and variables → Actions${NC}"
    echo
    echo "Required secrets:"
    echo "  ${GREEN}CF_API_TOKEN${NC} - Your Cloudflare API token"
    echo "  ${GREEN}CF_ACCOUNT_ID${NC} - Your Cloudflare account ID"
    echo "  ${GREEN}CF_ACCOUNT_SUBDOMAIN${NC} - Your workers.dev subdomain"
    echo
    echo "Optional secrets (for authenticated endpoints):"
    echo "  ${GREEN}WORKER_AUTH_TOKEN_PRODUCTION${NC} - Auth token for production"
    echo "  ${GREEN}WORKER_AUTH_TOKEN_STAGING${NC} - Auth token for staging"
    
    # Get account ID
    if command -v jq &> /dev/null; then
        ACCOUNT_ID=$(wrangler whoami --json 2>&1 | jq -r '.account_id // "" ' 2>/dev/null || echo "")
        if [ -n "$ACCOUNT_ID" ]; then
            echo -e "\n${GREEN}Your Account ID: ${ACCOUNT_ID}${NC}"
        fi
    fi
fi

# Create GitHub environments
echo -e "\n${BLUE}=== GitHub Environments ===${NC}"
echo -e "${YELLOW}Configure GitHub environments for deployment protection${NC}"
echo -e "${YELLOW}Go to: Settings → Environments${NC}"
echo
echo "Create these environments:"
echo "  1. ${GREEN}production${NC} - Add protection rules (require reviewers)"
echo "  2. ${GREEN}staging${NC} - Auto-deploy from PRs"
echo "  3. ${GREEN}development${NC} - Manual deployments"

# Summary
echo -e "\n${BLUE}=== Setup Summary ===${NC}"
echo -e "${GREEN}✅ KV namespaces created${NC}"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "  1. Update wrangler-crawler.toml with KV namespace IDs"
echo "  2. Add secrets to GitHub repository"
echo "  3. Configure GitHub environments"
echo "  4. Commit and push changes"
echo
echo -e "${GREEN}Once completed, the workflow will:${NC}"
echo "  - Auto-deploy to staging on PR"
echo "  - Auto-deploy to production on merge to main"
echo "  - Allow manual deployments via workflow dispatch"

# Save configuration template
echo -e "\n${YELLOW}Creating configuration template...${NC}"
cat > relay-crawler-github-config.md << EOF
# Relay Crawler GitHub Configuration

## KV Namespace IDs
$(cat kv_ids.txt 2>/dev/null || echo "No KV namespaces created yet")

## GitHub Secrets Required

### Core Secrets
- **CF_API_TOKEN**: Your Cloudflare API token
- **CF_ACCOUNT_ID**: ${ACCOUNT_ID:-Your Cloudflare account ID}
- **CF_ACCOUNT_SUBDOMAIN**: Your workers.dev subdomain

### Optional Secrets
- **WORKER_AUTH_TOKEN_PRODUCTION**: Authentication token for production
- **WORKER_AUTH_TOKEN_STAGING**: Authentication token for staging

## Deployment URLs
- Production: https://relay-crawler-prod.[subdomain].workers.dev
- Staging: https://relay-crawler-staging.[subdomain].workers.dev  
- Development: https://relay-crawler.[subdomain].workers.dev

## GitHub Environments
1. **production** - Protection rules recommended
2. **staging** - Auto-deploy from PRs
3. **development** - Manual deployments

## Workflow Triggers
- Push to main → Production deployment
- Pull request → Staging deployment
- Manual dispatch → Choose environment

## Monitoring
After deployment, check:
- Health: GET /health
- Stats: GET /stats
- Logs: wrangler tail --env [environment] -c wrangler-crawler.toml
EOF

echo -e "${GREEN}✅ Configuration saved to: relay-crawler-github-config.md${NC}"

# Cleanup
rm -f kv_ids.txt

echo -e "\n${GREEN}🎉 Setup complete!${NC}"