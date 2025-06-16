# Nostr Push Notification Worker

This branch contains the Cloudflare Worker infrastructure for handling Nostr push notifications in the +chorus application.

## 🔔 Live Deployment

- **Worker URL**: https://nostr-nip72-poller.protestnet.workers.dev
- **Health Check**: https://nostr-nip72-poller.protestnet.workers.dev/health
- **Stats**: https://nostr-nip72-poller.protestnet.workers.dev/stats

## 🏗️ Infrastructure Components

### Cloudflare Worker ()
- **Main Script**:  - Core NIP-72 relay polling logic
- **Configuration**:  - Deployment configuration template
- **Documentation**:  - Deployment and security guide

### Push API Service ()
- Express.js API for managing push subscriptions
- PostgreSQL database integration with Drizzle ORM
- VAPID-based web push notification dispatch
- Authentication middleware and error handling

### Development Tools
-  - VAPID key generation utility
-  - Push notification testing script
- Comprehensive deployment documentation

## ✨ Features

- **NIP-72 Relay Polling**: Monitors Nostr relays for group activity
- **Smart Targeting**: Determines notification recipients based on event types
- **KV Storage**: Caches events and tracks user online status  
- **Scheduled Tasks**: Runs every 30 minutes via cron triggers
- **Health Monitoring**: Status endpoints for operational monitoring
- **Secure Secrets**: All credentials managed via Cloudflare secrets

## 🛡️ Security

- **Zero Hardcoded Secrets**: All tokens stored in Cloudflare secrets
- **Template Configurations**: Safe deployment examples
- **Environment Separation**: Production/staging configurations
- **Comprehensive Logging**: Without exposing sensitive data

## 🚀 Deployment Status

✅ **LIVE and OPERATIONAL**
- Worker responding to health checks
- Scheduled polling active
- KV storage functional  
- Secrets properly configured

## 📚 Next Steps

1. **Integration Testing**: Connect with React frontend
2. **Monitoring**: Set up alerting for worker health
3. **Scaling**: Optimize for production load
4. **Features**: Add more notification types and filters

This worker forms the backbone of real-time Nostr notifications for the +chorus PWA.
