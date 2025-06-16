/**
 * All-in-One Cloudflare Worker
 * Monitors Nostr relays AND sends push notifications
 * No separate bot needed!
 */

import { NostrEvent, SimplePool, nip19, verifyEvent, Filter } from 'nostr-tools';
import { WorkerAPI } from './worker-api-enhanced';

// Add missing type definitions
type KVNamespace = {
  get: <T>(key: string, type: 'text' | 'json') => Promise<T | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

type DurableObjectNamespace = {
  idFromName: (name: string) => DurableObjectId;
  get: (id: DurableObjectId) => DurableObjectStub;
};

type DurableObjectId = {
  toString: () => string;
};

type DurableObjectStub = {
  fetch: (request: Request) => Promise<Response>;
};

type ScheduledEvent = {
  cron: string;
  scheduledTime: number;
};

type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

interface WorkerEnv {
  KV: KVNamespace;
  PUSH_QUEUE: DurableObjectNamespace;
  RELAY_URL: string;
  PUSH_DISPATCH_API: string;
  BOT_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

export interface Env {
  KV: KVNamespace;
  PUSH_QUEUE: DurableObjectNamespace;
  RELAY_URL: string;
  RELAY_URLS: string; // Comma-separated relay URLs
  PUSH_DISPATCH_API: string;
  BOT_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  WORKER_URL?: string;
}

interface NotificationPayload {
  event: {
    id: string;
    [key: string]: unknown;
  };
  notifications: Array<{
    npub: string;
    type: string;
    content: string;
  }>;
}

// Add notification type definitions
interface Notification {
  type: string;
  groupId?: string;
  eventId?: string;
  author?: string;
  content?: string;
  timestamp: number;
  reactor?: string;
  reaction?: string;
}

interface NotificationEntry {
  npub: string;
  notification: Notification;
}

// Add user type definition
interface UserPreferences {
  enabled: boolean;
  mentions: boolean;
  groupActivity: boolean;
  reactions: boolean;
  moderation: boolean;
  frequency: 'immediate' | 'hourly' | 'daily';
  subscribedGroups: string[];
}

interface UserSubscription {
  subscription: PushSubscription;
  preferences: UserPreferences;
  lastNotified?: number;
}

export default {
  /**
   * Scheduled event - runs every 5 minutes to check for new Nostr events
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🤖 Scheduled relay polling triggered');
    
    // Use waitUntil to ensure the polling completes
    ctx.waitUntil(this.pollRelaysForNotifications(env));
  },

  /**
   * HTTP requests - handles API endpoints
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      const api = new WorkerAPI(env);
      return api.handleRequest(request);
    }
    
    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'Notification worker is running',
        version: '2.0'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fix case declarations by wrapping in blocks
    switch (url.pathname) {
      case '/api/notify': {
        const auth = request.headers.get('Authorization');
        if (auth !== `Bearer ${env.BOT_TOKEN}`) {
          return new Response('Unauthorized', { status: 401 });
        }
        const response = await handleNotify(request, env);
        return response;
      }
      case '/api/test': {
        const auth = request.headers.get('Authorization');
        if (auth !== `Bearer ${env.BOT_TOKEN}`) {
          return new Response('Unauthorized', { status: 401 });
        }
        const response = await handleTestNotification(request, env);
        return response;
      }
      default:
        return new Response('Not Found', { status: 404 });
    }
  },

  /**
   * Main polling logic - runs entirely in the worker
   */
  async pollRelaysForNotifications(env: Env): Promise<void> {
    const relayUrls = env.RELAY_URLS.split(',').map(url => url.trim());
    console.log(`📡 Polling ${relayUrls.length} relays for notifications`);
    
    try {
      // Get last check time
      const lastCheckKey = 'last_poll_time';
      const lastCheck = await env.KV.get<string>(lastCheckKey, 'text');
      const since = lastCheck ? parseInt(lastCheck) : Math.floor(Date.now() / 1000) - 3600;
      
      // Load user subscriptions
      const users = await this.loadUserSubscriptions(env);
      const groups = await this.loadGroupSubscriptions(env);
      
      if (users.size === 0) {
        console.log('No users with notifications enabled');
        return;
      }
      
      // Fetch events from relays
      const events = await this.fetchEventsFromRelays(relayUrls, since, groups);
      console.log(`📥 Found ${events.length} new events`);
      
      let processedCount = 0;
      let notificationCount = 0;
      
      // Process each event
      for (const event of events) {
        // Check if already processed
        const processed = await env.KV.get<string>(`processed:${event.id}`, 'text');
        if (processed) continue;
        
        // Determine who to notify
        const notifications = await this.determineNotifications(event, users, groups);
        
        // Queue notifications
        for (const notification of notifications) {
          await this.queueNotification(env, notification);
          notificationCount++;
        }
        
        // Mark as processed
        await env.KV.put(`processed:${event.id}`, '1', { expirationTtl: 86400 });
        processedCount++;
      }
      
      // Update last check time
      const now = Math.floor(Date.now() / 1000);
      await env.KV.put(lastCheckKey, now.toString());
      
      console.log(`✅ Processed ${processedCount} events, queued ${notificationCount} notifications`);
      
    } catch (error) {
      console.error('Error polling relays:', error);
    }
  },

  /**
   * Load all user subscriptions from KV
   */
  async loadUserSubscriptions(env: Env): Promise<Map<string, UserSubscription>> {
    const users = new Map<string, UserSubscription>();
    const list = await env.KV.list({ prefix: 'sub:' });
    
    for (const key of list.keys) {
      const data = await env.KV.get<UserSubscription>(key.name, 'json');
      if (data) {
        const npub = key.name.replace('sub:', '');
        users.set(npub, data);
      }
    }
    
    return users;
  },

  /**
   * Load group subscriptions from KV
   */
  async loadGroupSubscriptions(env: Env): Promise<Map<string, Set<string>>> {
    const groups = new Map();
    const list = await env.KV.list({ prefix: 'group:' });
    
    for (const key of list.keys) {
      const members = await env.KV.get(key.name, 'json') as string[];
      if (members && members.length > 0) {
        const groupId = key.name.replace('group:', '');
        groups.set(groupId, new Set(members));
      }
    }
    
    return groups;
  },

  /**
   * Fetch events from Nostr relays using WebSocket
   */
  async fetchEventsFromRelays(relayUrls: string[], since: number, groups: Map<string, Set<string>>): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];
    
    // Create filters based on subscribed groups
    const filters: Filter[] = [];
    
    // Add filters for each group
    for (const [groupId, members] of groups) {
      if (members.size > 0) {
        const [kind, pubkey, identifier] = groupId.split(':');
        if (kind === '34550') {
          filters.push({
            kinds: [11], // Group posts
            '#a': [groupId],
            since
          });
        }
      }
    }
    
    // Add filters for reactions and moderation
    if (filters.length > 0) {
      filters.push({
        kinds: [7, 4550, 4551], // Reactions, approvals, removals
        since
      });
    }
    
    if (filters.length === 0) {
      console.log('No filters to apply');
      return events;
    }
    
    // Connect to relays and fetch events
    for (const relayUrl of relayUrls) {
      try {
        const relayEvents = await this.fetchFromSingleRelay(relayUrl, filters);
        events.push(...relayEvents);
      } catch (error) {
        console.error(`Error fetching from ${relayUrl}:`, error);
      }
    }
    
    // Deduplicate events by ID
    const uniqueEvents = new Map<string, NostrEvent>();
    for (const event of events) {
      if (!uniqueEvents.has(event.id)) {
        uniqueEvents.set(event.id, event);
      }
    }
    
    return Array.from(uniqueEvents.values());
  },

  /**
   * Fetch from a single relay
   */
  async fetchFromSingleRelay(relayUrl: string, filters: Filter[]): Promise<NostrEvent[]> {
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const ws = new WebSocket(relayUrl);
      const subId = Math.random().toString(36).substring(7);
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve(events);
      }, 5000); // 5 second timeout
      
      ws.onopen = () => {
        // Send subscription
        ws.send(JSON.stringify(['REQ', subId, ...filters]));
      };
      
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
            events.push(data[2]);
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            // End of stored events
            clearTimeout(timeout);
            ws.close();
            resolve(events);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };
      
      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(events);
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
        resolve(events);
      };
    });
  },

  /**
   * Determine who should be notified for an event
   */
  async determineNotifications(event: NostrEvent, users: Map<string, UserSubscription>, groups: Map<string, Set<string>>): Promise<NotificationEntry[]> {
    const notifications: NotificationEntry[] = [];
    
    // Verify event signature
    if (!verifyEvent(event)) {
      console.warn('Invalid event signature:', event.id);
      return notifications;
    }
    
    // Handle different event types
    switch (event.kind) {
      case 11: { // Group post
        const aTag = event.tags.find(tag => tag[0] === 'a');
        if (aTag) {
          const groupId = aTag[1];
          const groupMembers = groups.get(groupId);
          
          if (groupMembers) {
            // Check for mentions
            const mentions = this.extractMentions(event);
            
            // Notify group members
            for (const memberNpub of groupMembers) {
              // Skip the author
              const authorNpub = nip19.npubEncode(event.pubkey);
              if (authorNpub === memberNpub) continue;
              
              const user = users.get(memberNpub);
              if (!user || !user.preferences?.groupActivity) continue;
              
              notifications.push({
                npub: memberNpub,
                notification: {
                  type: mentions.includes(memberNpub) ? 'mention' : 'new_post',
                  groupId,
                  eventId: event.id,
                  author: authorNpub,
                  content: event.content.substring(0, 100),
                  timestamp: event.created_at
                }
              });
            }
          }
        }
        break;
      }
        
      case 7: { // Reaction
        const pTag = event.tags.find(tag => tag[0] === 'p');
        if (pTag) {
          const targetNpub = nip19.npubEncode(pTag[1]);
          const user = users.get(targetNpub);
          
          if (user && user.preferences?.reactions) {
            notifications.push({
              npub: targetNpub,
              notification: {
                type: 'reaction',
                eventId: event.tags.find(tag => tag[0] === 'e')?.[1],
                reactor: nip19.npubEncode(event.pubkey),
                reaction: event.content || '+',
                timestamp: event.created_at
              }
            });
          }
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
    
    // Extract from p tags
    event.tags
      .filter(tag => tag[0] === 'p')
      .forEach(tag => {
        try {
          mentions.add(nip19.npubEncode(tag[1]));
        } catch (e) {
          // Invalid pubkey
        }
      });
    
    // Extract from content
    const npubPattern = /nostr:(npub[a-z0-9]{59})/gi;
    const matches = event.content.matchAll(npubPattern);
    for (const match of matches) {
      mentions.add(match[1]);
    }
    
    return Array.from(mentions);
  },

  /**
   * Queue a notification for delivery
   */
  async queueNotification(env: Env, { npub, notification }: NotificationEntry): Promise<void> {
    // Call the worker API to send the notification
    const response = await fetch(`https://${env.WORKER_URL || 'localhost'}/api/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.BOT_TOKEN}`
      },
      body: JSON.stringify({ npub, notification })
    });
    
    if (!response.ok) {
      console.error(`Failed to queue notification for ${npub}: ${response.status}`);
    }
  }
};

// Add handler function declarations
async function handleNotify(request: Request, env: Env): Promise<Response> {
  const body = await request.json();
  const { npub, notification } = body;
  
  if (!npub || !notification) {
    return new Response('Invalid request', { status: 400 });
  }
  
  // Implementation here
  return new Response('Not implemented', { status: 501 });
}

async function handleTestNotification(request: Request, env: Env): Promise<Response> {
  const body = await request.json();
  const { npub, message } = body;
  
  if (!npub) {
    return new Response('Invalid request', { status: 400 });
  }
  
  // Implementation here
  return new Response('Not implemented', { status: 501 });
}