#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Testing Push Notification System..."

# Test data
NPUB="npub1test123456789abcdefghijklmnopqrstuvwxyz"
SUBSCRIPTION='{
  "endpoint": "https://fcm.googleapis.com/fcm/send/test-token",
  "keys": {
    "p256dh": "test-p256dh",
    "auth": "test-auth"
  }
}'

# 1. Register push subscription
echo -e "\n${GREEN}1. Testing subscription registration...${NC}"
RESPONSE=$(curl -s -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d "{\"npub\":\"$NPUB\",\"subscription\":$SUBSCRIPTION}")

echo "Response: $RESPONSE"

# 2. Send test notification
echo -e "\n${GREEN}2. Sending test notification...${NC}"
RESPONSE=$(curl -s -X POST http://localhost:3000/test-notification \
  -H "Content-Type: application/json" \
  -d "{\"npub\":\"$NPUB\"}")

echo "Response: $RESPONSE"

# 3. Check metrics
echo -e "\n${GREEN}3. Checking metrics...${NC}"
RESPONSE=$(curl -s http://localhost:3000/metrics)
echo "Metrics: $RESPONSE"

# 4. View logs
echo -e "\n${GREEN}4. Viewing logs...${NC}"
RESPONSE=$(curl -s http://localhost:3000/logs)
echo "Logs: $RESPONSE"

echo -e "\n${GREEN}Tests completed!${NC}" 