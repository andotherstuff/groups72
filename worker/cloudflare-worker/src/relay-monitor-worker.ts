/**
 * Relay Monitor Worker
 * Monitors Nostr relays for events and triggers notifications
 */

import { NostrEvent, verifyEvent, Filter, nip19 } from 'nostr-tools';

// Add missing type definitions

type KVNamespace = {
  get: <T>(key: string, type?: 'text' | 'json') => Promise<T | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

type ScheduledEvent = {
  cron: string;
  scheduledTime: number;
};

type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

export interface Env {
  KV: KVNamespace;
  RELAY_URLS: string;
  NOTIFICATION_WORKER_URL: string;
  WORKER_AUTH_TOKEN: string;
}

// Add notification type definition
interface RelayNotification {
  npub: string;
  type: string;
  priority: string;
  groupId?: string;
}

export default {
  /**
   * Scheduled event - runs every 5 minutes
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🤖 Relay monitoring triggered at', new Date(event.scheduledTime).toISOString());
    
    ctx.waitUntil(this.monitorRelays(env));
  },

  /**
   * HTTP endpoint for health checks and manual triggers
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/health': {
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'relay-monitor',
          lastCheck: await env.KV.get('last_check_time')
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      case '/trigger': {
        // Manual trigger for testing
        const auth = request.headers.get('Authorization');
        if (auth !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
          return new Response('Unauthorized', { status: 401 });
        }
        await this.monitorRelays(env);
        return new Response('Triggered', { status: 200 });
      }
      default: {
        return new Response('Not Found', { status: 404 });
      }
    }
  },

  /**
   * Main monitoring logic
   */
  async monitorRelays(env: Env): Promise<void> {
    const relayUrls = env.RELAY_URLS.split(',').map(url => url.trim());
    console.log(`📡 Monitoring ${relayUrls.length} relays`);
    
    try {
      // Get last check timestamp
      const lastCheck = await env.KV.get<string>('last_check_time', 'text');
      const since = lastCheck ? parseInt(lastCheck) : Math.floor(Date.now() / 1000) - 3600;
      
      // Get active groups to monitor
      const activeGroups = await this.getActiveGroups(env);
      if (activeGroups.length === 0) {
        console.log('No active groups to monitor');
        return;
      }
      
      // Fetch events from all relays
      const allEvents: NostrEvent[] = [];
      for (const relayUrl of relayUrls) {
        try {
          const events = await this.fetchFromRelay(relayUrl, since, activeGroups);
          allEvents.push(...events);
          console.log(`📥 Fetched ${events.length} events from ${relayUrl}`);
        } catch (error) {
          console.error(`Failed to fetch from ${relayUrl}:`, error);
        }
      }
      
      // Deduplicate events
      const uniqueEvents = this.deduplicateEvents(allEvents);
      console.log(`📊 Total unique events: ${uniqueEvents.length}`);
      
      // Process each event
      let processedCount = 0;
      for (const event of uniqueEvents) {
        // Check if already processed
        const processed = await env.KV.get<string>(`processed:${event.id}`, 'text');
        if (processed) continue;
        
        // Analyze event and determine notifications
        const notifications = await this.analyzeEvent(event, env);
        
        if (notifications.length > 0) {
          // Send to notification worker
          await this.sendToNotificationWorker(env, event, notifications);
        }
        
        // Mark as processed
        await env.KV.put(`processed:${event.id}`, '1', { expirationTtl: 86400 }); // 24h
        processedCount++;
      }
      
      // Update last check time
      await env.KV.put('last_check_time', Math.floor(Date.now() / 1000).toString());
      
      console.log(`✅ Processed ${processedCount} new events`);
      
    } catch (error) {
      console.error('Error monitoring relays:', error);
    }
  },

  /**
   * Get list of active groups that have subscribers
   */
  async getActiveGroups(env: Env): Promise<string[]> {
    const groups: string[] = [];
    const list = await env.KV.list({ prefix: 'group:' });
    
    for (const key of list.keys) {
      const groupId = key.name.replace('group:', '');
      // Check if group has any subscribers
      const subscribers = await env.KV.get<string[]>(`group:${groupId}`, 'json') || [];
      if (subscribers && subscribers.length > 0) {
        groups.push(groupId);
      }
    }
    
    return groups;
  },

  /**
   * Fetch events from a single relay
   */
  async fetchFromRelay(relayUrl: string, since: number, groups: string[]): Promise<NostrEvent[]> {
    const filters: Filter[] = [];
    
    // Create filters for group posts
    for (const groupId of groups) {
      filters.push({
        kinds: [11], // Group posts
        '#a': [groupId],
        since
      });
    }
    
    // Add filters for reactions, moderation, etc.
    filters.push({
      kinds: [7, 1111, 4550, 4551], // Reactions, replies, approvals, removals
      since,
      limit: 500
    });
    
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const ws = new WebSocket(relayUrl);
      const subId = 'monitor-' + Math.random().toString(36).substring(7);
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve(events);
      }, 10000); // 10 second timeout
      
      ws.addEventListener('open', () => {
        // Subscribe to events
        ws.send(JSON.stringify(['REQ', subId, ...filters]));
      });
      
      ws.addEventListener('message', (msg) => {
        try {
          const data = JSON.parse(msg.data);
          
          if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
            const event = data[2];
            if (verifyEvent(event)) {
              events.push(event);
            }
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            // End of stored events
            clearTimeout(timeout);
            ws.close();
          }
        } catch (error) {
          console.error('Error parsing relay message:', error);
        }
      });
      
      ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        clearTimeout(timeout);
        resolve(events);
      });
      
      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve(events);
      });
    });
  },

  /**
   * Deduplicate events by ID
   */
  deduplicateEvents(events: NostrEvent[]): NostrEvent[] {
    const seen = new Map<string, NostrEvent>();
    
    for (const event of events) {
      if (!seen.has(event.id) || event.created_at > seen.get(event.id)!.created_at) {
        seen.set(event.id, event);
      }
    }
    
    return Array.from(seen.values());
  },

  /**
   * Analyze event and determine who should be notified
   */
  async analyzeEvent(event: NostrEvent, env: Env): Promise<RelayNotification[]> {
    const notifications: RelayNotification[] = [];
    
    switch (event.kind) {
      case 11: {
        const aTag = event.tags.find(tag => tag[0] === 'a');
        if (!aTag) break;
        
        const groupId = aTag[1];
        const subscribers = await env.KV.get<string[]>(`group:${groupId}`, 'json') || [];
        if (subscribers.length === 0) break;
        
        const mentions = this.extractMentions(event);
        const authorNpub = nip19.npubEncode(event.pubkey);
        
        // Notify subscribers (except author)
        for (const npub of subscribers) {
          if (npub === authorNpub) continue;
          
          notifications.push({
            npub,
            type: mentions.includes(npub) ? 'mention' : 'group_post',
            priority: mentions.includes(npub) ? 'high' : 'normal',
            groupId
          });
        }
        
        // Notify mentioned users not in group
        for (const mentionedNpub of mentions) {
          if (!subscribers.includes(mentionedNpub)) {
            notifications.push({
              npub: mentionedNpub,
              type: 'mention',
              priority: 'high',
              groupId
            });
          }
        }
        break;
      }
      
      case 7: {
        const pTag = event.tags.find(tag => tag[0] === 'p');
        if (pTag) {
          const targetNpub = nip19.npubEncode(pTag[1]);
          notifications.push({
            npub: targetNpub,
            type: 'reaction',
            priority: 'normal'
          });
        }
        break;
      }
      
      case 1111: { // Reply
        const pTags = event.tags.filter(tag => tag[0] === 'p');
        for (const pTag of pTags) {
          const targetNpub = nip19.npubEncode(pTag[1]);
          notifications.push({
            npub: targetNpub,
            type: 'reply',
            priority: 'high'
          });
        }
        break;
      }
      
      case 4550: // Post approved
      case 4551: { // Post removed
        const pTag = event.tags.find(tag => tag[0] === 'p');
        if (pTag) {
          const targetNpub = nip19.npubEncode(pTag[1]);
          notifications.push({
            npub: targetNpub,
            type: event.kind === 4550 ? 'post_approved' : 'post_removed',
            priority: 'high'
          });
        }
        break;
      }
    }
    
    return notifications;
  },

  /**
   * Extract mentions from event
   */
  extractMentions(event: NostrEvent): string[] {
    const mentions = new Set<string>();
    
    // From p tags
    event.tags
      .filter(tag => tag[0] === 'p')
      .forEach(tag => {
        try {
          mentions.add(nip19.npubEncode(tag[1]));
        } catch (e) {
          // Invalid pubkey
        }
      });
    
    // From content
    const npubPattern = /nostr:(npub[a-z0-9]{59})/gi;
    const matches = event.content.matchAll(npubPattern);
    for (const match of matches) {
      mentions.add(match[1]);
    }
    
    return Array.from(mentions);
  },

  /**
   * Send notifications to the notification worker
   */
  async sendToNotificationWorker(env: Env, event: NostrEvent, notifications: RelayNotification[]): Promise<void> {
    const payload = {
      event: {
        id: event.id,
        pubkey: event.pubkey,
        kind: event.kind,
        content: event.content.substring(0, 200),
        created_at: event.created_at,
        tags: event.tags
      },
      notifications
    };
    
    const response = await fetch(`${env.NOTIFICATION_WORKER_URL}/api/process-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.WORKER_AUTH_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error(`Failed to send to notification worker: ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
    } else {
      console.log(`📤 Sent ${notifications.length} notifications for event ${event.id}`);
    }
  }
};