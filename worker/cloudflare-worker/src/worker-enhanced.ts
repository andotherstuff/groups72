/**
 * Enhanced Cloudflare Worker for NIP-72 Nostr Relay Polling
 * Now with YOLO notification system!
 */

import { NostrEvent, verifyEvent } from 'nostr-tools';
import { NotificationSystem, NOTIFICATION_EVENT_KINDS } from './notification-system';
import { WorkerAPI } from './worker-api';

export interface Env {
  KV: KVNamespace;
  RELAY_URL: string;
  PUSH_DISPATCH_API: string;
  BOT_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

/**
 * Main worker entry point - handles scheduled events and HTTP requests
 */
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🚀 YOLO Scheduled polling triggered:', event.scheduledTime);
    
    try {
      await pollRelayForUpdates(env, ctx);
    } catch (error) {
      console.error('❌ Error in scheduled polling:', error);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      const api = new WorkerAPI(env);
      return api.handleRequest(request);
    }
    
    // Handle other routes
    try {
      switch (url.pathname) {
        case '/heartbeat':
          return handleHeartbeat(request, env);
        case '/health':
          return handleHealthCheck(env);
        case '/stats':
          return handleStats(env);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Error handling request:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Enhanced polling function with notification system
 */
async function pollRelayForUpdates(env: Env, ctx: ExecutionContext): Promise<void> {
  const relayUrl = env.RELAY_URL;
  const relayId = new URL(relayUrl).hostname;
  const notificationSystem = new NotificationSystem(env);
  
  // Get the last seen timestamp for this relay
  const lastSeenKey = `relay_last_seen:${relayId}`;
  const lastSeen = await env.KV.get(lastSeenKey);
  const since = lastSeen ? parseInt(lastSeen) : Math.floor(Date.now() / 1000) - 3600;
  
  console.log(`📡 Polling ${relayUrl} for events since ${new Date(since * 1000).toISOString()}`);
  
  try {
    // Connect to relay and fetch new events
    const events = await fetchEventsFromRelay(relayUrl, since);
    console.log(`📥 Fetched ${events.length} new events from relay`);
    
    let newestTimestamp = since;
    let processedCount = 0;
    let notificationCount = 0;
    
    for (const event of events) {
      // Track newest event timestamp
      if (event.created_at > newestTimestamp) {
        newestTimestamp = event.created_at;
      }
      
      // Check if we've already processed this event
      const eventCacheKey = `event_cache:${event.id}`;
      const cached = await env.KV.get(eventCacheKey);
      
      if (cached) {
        console.log(`⏭️ Skipping already processed event: ${event.id}`);
        continue;
      }
      
      // Process event for notifications
      const triggers = await notificationSystem.processEvent(event);
      
      for (const trigger of triggers) {
        await notificationSystem.queueNotification(trigger);
        notificationCount++;
      }
      
      // Cache the event ID to prevent reprocessing
      await env.KV.put(eventCacheKey, '1', {
        expirationTtl: 86400 // 24 hours
      });
      
      processedCount++;
      
      // Log interesting events
      if (triggers.length > 0) {
        console.log(`🔔 Event ${event.id} triggered ${triggers.length} notifications`);
      }
    }
    
    // Flush all queued notifications
    await notificationSystem.flushAll();
    
    // Update the last seen timestamp
    if (newestTimestamp > since) {
      await env.KV.put(lastSeenKey, newestTimestamp.toString());
    }
    
    // Update stats
    await updateStats(env, {
      eventsProcessed: processedCount,
      notificationsQueued: notificationCount,
      lastPoll: Date.now()
    });
    
    console.log(`✅ Processed ${processedCount} events, queued ${notificationCount} notifications`);
    
  } catch (error) {
    console.error('❌ Error polling relay:', error);
    throw error;
  }
}

/**
 * Fetch events from Nostr relay
 */
async function fetchEventsFromRelay(relayUrl: string, since: number): Promise<NostrEvent[]> {
  // In production, use WebSocket connection
  // For now, simulate with fetch
  const ws = new WebSocket(relayUrl);
  const events: NostrEvent[] = [];
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      resolve(events);
    }, 5000); // 5 second timeout
    
    ws.onopen = () => {
      // Subscribe to relevant events
      const filters = [
        {
          kinds: Object.values(NOTIFICATION_EVENT_KINDS),
          since: since,
          limit: 100
        }
      ];
      
      ws.send(JSON.stringify(['REQ', 'worker-poll', ...filters]));
    };
    
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === 'EVENT' && data[2]) {
          events.push(data[2]);
        } else if (data[0] === 'EOSE') {
          // End of stored events
          clearTimeout(timeout);
          ws.close();
          resolve(events);
        }
      } catch (error) {
        console.error('Error parsing relay message:', error);
      }
    };
    
    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
  });
}

/**
 * Handle user registration for push notifications
 */
async function handleUserRegistration(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    const body = await request.json() as {
      npub: string;
      subscription: {
        endpoint: string;
        keys: {
          p256dh: string;
          auth: string;
        };
      };
      preferences: unknown;
    };
    
    const userPrefs = {
      npub: body.npub,
      pushEndpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      vapidAuth: body.subscription.keys.auth,
      subscriptions: body.preferences?.subscriptions || {
        groups: [],
        keywords: [],
        authors: []
      },
      settings: body.preferences?.settings || {
        mentions: true,
        groupActivity: true,
        reactions: false,
        moderation: true,
        frequency: 'immediate'
      },
      lastNotified: 0,
      notificationCount: 0
    };
    
    // Store user preferences
    await env.KV.put(`user:${body.npub}`, JSON.stringify(userPrefs));
    
    // Update keyword subscriptions
    for (const keyword of userPrefs.subscriptions.keywords) {
      const key = `keywords:${keyword}`;
      const existing = await env.KV.get(key, 'json') as string[] || [];
      if (!existing.includes(body.npub)) {
        existing.push(body.npub);
        await env.KV.put(key, JSON.stringify(existing));
      }
    }
    
    // Update group subscriptions
    for (const groupId of userPrefs.subscriptions.groups) {
      const key = `group:${groupId}:subscribers`;
      const existing = await env.KV.get(key, 'json') as string[] || [];
      if (!existing.includes(body.npub)) {
        existing.push(body.npub);
        await env.KV.put(key, JSON.stringify(existing));
      }
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return new Response('Bad request', { status: 400 });
  }
}

/**
 * Handle user unregistration
 */
async function handleUserUnregistration(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    const body = await request.json() as { npub: string };
    
    // Get user preferences to clean up subscriptions
    const prefs = await env.KV.get(`user:${body.npub}`, 'json') as UserPreferences | null;
    if (prefs) {
      // Remove from keyword subscriptions
      for (const keyword of prefs.subscriptions?.keywords || []) {
        const key = `keywords:${keyword}`;
        const subscribers = await env.KV.get(key, 'json') as string[] || [];
        const updated = subscribers.filter(n => n !== body.npub);
        await env.KV.put(key, JSON.stringify(updated));
      }
      
      // Remove from group subscriptions
      for (const groupId of prefs.subscriptions?.groups || []) {
        const key = `group:${groupId}:subscribers`;
        const subscribers = await env.KV.get(key, 'json') as string[] || [];
        const updated = subscribers.filter(n => n !== body.npub);
        await env.KV.put(key, JSON.stringify(updated));
      }
    }
    
    // Delete user preferences
    await env.KV.delete(`user:${body.npub}`);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Unregistration error:', error);
    return new Response('Bad request', { status: 400 });
  }
}

/**
 * Handle test notification - YOLO style!
 */
async function handleTestNotification(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    const body = await request.json() as { npub: string; message?: string };
    const notificationSystem = new NotificationSystem(env);
    
    // Create a test trigger
    const trigger = {
      eventId: 'test-' + Date.now(),
      type: 'mention' as const,
      priority: 'high' as const,
      targetNpubs: [body.npub],
      content: body.message || '🚀 YOLO Test notification! If you see this, it works!',
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    await notificationSystem.queueNotification(trigger);
    await notificationSystem.flushAll();
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Test notification sent! YOLO!' 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Test notification error:', error);
    return new Response('Bad request', { status: 400 });
  }
}

/**
 * Update worker stats
 */
async function updateStats(env: Env, stats: unknown): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `stats:${today}`;
  
  const existing = await env.KV.get(key, 'json') as { timestamp: number } | null || {
    eventsProcessed: 0,
    notificationsQueued: 0,
    polls: 0
  };
  
  existing.eventsProcessed += stats.eventsProcessed;
  existing.notificationsQueued += stats.notificationsQueued;
  existing.polls += 1;
  existing.lastPoll = stats.lastPoll;
  
  await env.KV.put(key, JSON.stringify(existing), {
    expirationTtl: 7 * 24 * 60 * 60 // Keep for 7 days
  });
}

/**
 * Handle stats endpoint
 */
async function handleStats(env: Env): Promise<Response> {
  const today = new Date().toISOString().split('T')[0];
  const stats = await env.KV.get(`stats:${today}`, 'json') || {};
  
  const userCount = await env.KV.list({ prefix: 'user:' });
  const groupCount = await env.KV.list({ prefix: 'group:' });
  
  return new Response(JSON.stringify({
    today: stats,
    users: {
      total: userCount.keys.length
    },
    groups: {
      total: groupCount.keys.length
    },
    worker: {
      version: '2.0-YOLO',
      lastDeploy: new Date().toISOString()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle heartbeat endpoint
 */
async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  return new Response(JSON.stringify({
    status: 'alive',
    timestamp: new Date().toISOString(),
    message: 'YOLO notification worker is running! 🚀'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle health check endpoint
 */
async function handleHealthCheck(env: Env): Promise<Response> {
  try {
    // Check KV is accessible
    await env.KV.get('health_check');
    
    // Check relay connectivity (optional)
    // Could add WebSocket ping here
    
    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response('Service Unavailable', { status: 503 });
  }
}
