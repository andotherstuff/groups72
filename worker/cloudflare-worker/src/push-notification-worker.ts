/**
 * Push Notification Worker
 * Handles user subscriptions and sends push notifications
 */

import { nip19 } from 'nostr-tools';
import { PushQueue } from './push-queue';

// Add KVNamespace type
type KVNamespace = {
  get: <T>(key: string, type: 'text' | 'json') => Promise<T | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

export interface Env {
  KV: KVNamespace;
  WORKER_AUTH_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    type?: string;
    priority?: 'high' | 'normal' | 'low';
    [key: string]: unknown;
  };
}

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

interface UserSubscription {
  subscription: PushSubscription;
  lastNotified?: number;
  preferences: {
    enabled: boolean;
    mentions: boolean;
    groupActivity: boolean;
    reactions: boolean;
    moderation: boolean;
    frequency: 'immediate' | 'hourly' | 'daily';
    subscribedGroups: string[];
  };
}

interface NotificationPayload {
  event: {
    id: string;
    pubkey: string;
    kind: number;
    content: string;
    created_at: number;
    tags: string[][];
  };
  notifications: Array<{
    npub: string;
    type: string;
    priority: string;
    groupId?: string;
  }>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      let response: Response;
      
      switch (url.pathname) {
        case '/api/subscribe':
          response = await this.handleSubscribe(request, env);
          break;
          
        case '/api/unsubscribe':
          response = await this.handleUnsubscribe(request, env);
          break;
          
        case '/api/subscriptions':
          response = await this.handleGetSubscriptions(request, env);
          break;
          
        case '/api/preferences':
          response = await this.handleUpdatePreferences(request, env);
          break;
          
        case '/api/test-notification':
          response = await this.handleTestNotification(request, env);
          break;
          
        case '/api/subscription/check':
          response = await this.handleCheckSubscription(request, env);
          break;
          
        case '/api/process-notifications':
          response = await this.handleProcessNotifications(request, env);
          break;
          
        case '/health':
          response = new Response(JSON.stringify({
            status: 'ok',
            service: 'push-notification-worker',
            subscriptions: await env.KV.list({ prefix: 'sub:' }).then(r => r.keys.length)
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
          break;
          
        default:
          response = new Response('Not Found', { status: 404 });
      }
      
      // Add CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      
      return response;
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * Handle push subscription
   */
  async handleSubscribe(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as {
      npub: string;
      subscription: PushSubscription;
      preferences?: {
        settings?: Partial<UserSubscription['preferences']>;
        subscriptions?: { groups?: string[] };
      };
    };
    
    if (!body.npub || !body.subscription) {
      return new Response('Bad Request', { status: 400 });
    }
    
    const userSub: UserSubscription = {
      subscription: body.subscription,
      preferences: {
        enabled: body.preferences?.settings?.enabled ?? true,
        mentions: body.preferences?.settings?.mentions ?? true,
        groupActivity: body.preferences?.settings?.groupActivity ?? true,
        reactions: body.preferences?.settings?.reactions ?? false,
        moderation: body.preferences?.settings?.moderation ?? true,
        frequency: body.preferences?.settings?.frequency || 'immediate',
        subscribedGroups: body.preferences?.subscriptions?.groups || [],
      },
      lastNotified: 0
    };
    
    // Store subscription
    await env.KV.put(`sub:${body.npub}`, JSON.stringify(userSub));
    
    // Update group memberships
    for (const groupId of userSub.preferences.subscribedGroups) {
      await this.addUserToGroup(env, body.npub, groupId);
    }
    
    // Also send this info to the relay monitor
    await this.updateRelayMonitor(env, 'subscribe', body.npub, userSub.preferences.subscribedGroups);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Handle unsubscribe
   */
  async handleUnsubscribe(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { npub: string };
    
    const existing = await env.KV.get<UserSubscription>(`sub:${body.npub}`, 'json');
    if (existing) {
      // Remove from groups
      for (const groupId of existing.preferences.subscribedGroups) {
        await this.removeUserFromGroup(env, body.npub, groupId);
      }
    }
    
    // Delete subscription
    await env.KV.delete(`sub:${body.npub}`);
    
    // Update relay monitor
    await this.updateRelayMonitor(env, 'unsubscribe', body.npub, []);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Get all subscriptions (for bot/admin)
   */
  async handleGetSubscriptions(request: Request, env: Env): Promise<Response> {
    // Verify auth
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const subscriptions = await env.KV.list({ prefix: 'sub:' });
    const users: Record<string, string[]> = {};
    
    for (const key of subscriptions.keys) {
      const sub = await env.KV.get<UserSubscription>(key.name, 'json');
      if (sub) {
        users[key.name] = sub.preferences.subscribedGroups;
      }
    }
    
    return new Response(JSON.stringify({ users }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Update user preferences
   */
  async handleUpdatePreferences(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as {
      npub: string;
      preferences?: {
        settings?: Partial<UserSubscription['preferences']>;
        subscriptions?: { groups?: string[] };
      };
    };
    
    const existing = await env.KV.get<UserSubscription>(`sub:${body.npub}`, 'json');
    if (!existing) {
      return new Response('Not Found', { status: 404 });
    }
    
    // Update groups if changed
    const oldGroups = existing.preferences.subscribedGroups;
    const newGroups = body.preferences?.subscriptions?.groups || [];
    
    // Update group memberships
    for (const groupId of oldGroups) {
      if (!newGroups.includes(groupId)) {
        await this.removeUserFromGroup(env, body.npub, groupId);
      }
    }
    
    for (const groupId of newGroups) {
      if (!oldGroups.includes(groupId)) {
        await this.addUserToGroup(env, body.npub, groupId);
      }
    }
    
    // Update subscription
    existing.preferences.subscribedGroups = newGroups;
    existing.preferences = {
      ...existing.preferences,
      ...body.preferences?.settings
    };
    
    await env.KV.put(`sub:${body.npub}`, JSON.stringify(existing));
    
    // Update relay monitor
    await this.updateRelayMonitor(env, 'update', body.npub, newGroups);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Send test notification
   */
  async handleTestNotification(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { npub: string; message?: string };
    
    const sub = await env.KV.get<UserSubscription>(`sub:${body.npub}`, 'json');
    if (!sub) {
      return new Response('Not Found', { status: 404 });
    }
    
    const payload: PushNotificationPayload = {
      title: '🎵 Chorus Test Notification',
      body: body.message || 'Test notification from Chorus!',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      data: {
        url: '/settings/notifications',
        type: 'test'
      }
    };
    
    const success = await this.sendPushNotification(env, sub.subscription.endpoint, sub.subscription.keys, payload);
    
    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to send notification' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * Check if subscription is valid
   */
  async handleCheckSubscription(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { npub: string; endpoint: string };
    
    const sub = await env.KV.get<UserSubscription>(`sub:${body.npub}`, 'json');
    if (!sub || sub.subscription.endpoint !== body.endpoint) {
      return new Response('Not Found', { status: 404 });
    }
    
    return new Response(JSON.stringify({ valid: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Process notifications from relay monitor
   */
  async handleProcessNotifications(request: Request, env: Env): Promise<Response> {
    // Verify this is from our relay monitor
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const payload = await request.json() as NotificationPayload;
    console.log(`📨 Processing ${payload.notifications.length} notifications for event ${payload.event.id}`);
    
    let sent = 0;
    let failed = 0;
    
    for (const notification of payload.notifications) {
      const sub = await env.KV.get<UserSubscription>(`sub:${notification.npub}`, 'json');
      if (!sub) continue;
      
      // Check preferences
      if (!this.shouldSendNotification(sub, notification.type)) {
        console.log(`Skipping ${notification.type} for ${notification.npub} (preferences)`);
        continue;
      }
      
      // Rate limiting
      if (sub.lastNotified && Date.now() - sub.lastNotified < 60000) { // 1 minute
        console.log(`Rate limiting ${notification.npub}`);
        continue;
      }
      
      // Build notification
      const pushPayload = await this.buildPushPayload(payload.event, notification, sub);
      
      // Send push notification
      const success = await this.sendPushNotification(env, sub.subscription.endpoint, sub.subscription.keys, pushPayload);
      
      if (success) {
        sent++;
        // Update last notified
        sub.lastNotified = Date.now();
        await env.KV.put(`sub:${notification.npub}`, JSON.stringify(sub));
      } else {
        failed++;
      }
    }
    
    return new Response(JSON.stringify({ sent, failed, total: payload.notifications.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Check if should send notification based on preferences
   */
  shouldSendNotification(sub: UserSubscription, type: string): boolean {
    switch (type) {
      case 'mention':
        return sub.preferences.mentions;
      case 'group_post':
        return sub.preferences.groupActivity;
      case 'reaction':
        return sub.preferences.reactions;
      case 'post_approved':
      case 'post_removed':
        return sub.preferences.moderation;
      default:
        return true;
    }
  },

  /**
   * Build push notification payload
   */
  async buildPushPayload(
    event: NotificationPayload['event'],
    notification: NotificationPayload['notifications'][number],
    sub: UserSubscription
  ): Promise<PushNotificationPayload> {
    const authorNpub = nip19.npubEncode(event.pubkey);
    let title = '';
    let body = event.content.substring(0, 100);
    let url = '/';
    
    switch (notification.type) {
      case 'mention':
        title = '💬 You were mentioned';
        url = `/group/${notification.groupId}?post=${event.id}`;
        break;
      case 'group_post':
        title = '📝 New post in group';
        url = `/group/${notification.groupId}?post=${event.id}`;
        break;
      case 'reaction':
        title = '👍 New reaction';
        body = 'Someone reacted to your post';
        url = `/notifications`;
        break;
      case 'reply':
        title = '💬 New reply';
        url = `/notifications`;
        break;
      case 'post_approved':
        title = '✅ Post approved';
        body = 'Your post has been approved';
        break;
      case 'post_removed':
        title = '❌ Post removed';
        body = 'Your post has been removed';
        break;
      default:
        title = '🔔 New notification';
    }
    
    return {
      title,
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      data: {
        url,
        eventId: event.id,
        type: notification.type,
        groupId: notification.groupId
      }
    };
  },

  /**
   * Send push notification using Web Push protocol
   */
  async sendPushNotification(env: Env, endpoint: string, keys: PushSubscriptionKeys, payload: PushNotificationPayload): Promise<boolean> {
    try {
      const message = JSON.stringify(payload);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `vapid t=${env.VAPID_PUBLIC_KEY}, k=${env.VAPID_PRIVATE_KEY}`,
          'TTL': '86400',
          'Urgency': payload.data?.priority === 'high' ? 'high' : 'normal'
        },
        body: message
      });
      
      if (response.ok) {
        console.log(`✅ Push sent to ${endpoint.substring(0, 50)}...`);
        return true;
      } else {
        console.error(`❌ Push failed: ${response.status}`);
        
        // Handle expired subscriptions
        if (response.status === 410) {
          // TODO: Remove subscription
        }
        
        return false;
      }
    } catch (error) {
      console.error('Push error:', error);
      return false;
    }
  },

  /**
   * Add user to group
   */
  async addUserToGroup(env: Env, npub: string, groupId: string): Promise<void> {
    const members = await env.KV.get<string[]>(`group:${groupId}`, 'json') || [];
    if (!members.includes(npub)) {
      members.push(npub);
      await env.KV.put(`group:${groupId}`, JSON.stringify(members));
    }
  },

  /**
   * Remove user from group
   */
  async removeUserFromGroup(env: Env, npub: string, groupId: string): Promise<void> {
    const members = await env.KV.get<string[]>(`group:${groupId}`, 'json') || [];
    const filtered = members.filter(n => n !== npub);
    if (filtered.length > 0) {
      await env.KV.put(`group:${groupId}`, JSON.stringify(filtered));
    } else {
      await env.KV.delete(`group:${groupId}`);
    }
  },

  /**
   * Update relay monitor about subscription changes
   */
  async updateRelayMonitor(env: Env, action: string, npub: string, groups: string[]): Promise<void> {
    // The relay monitor shares the same KV namespace, so it will see the updates
    console.log(`Updated relay monitor: ${action} for ${npub} with ${groups.length} groups`);
  }
};

export { PushQueue };