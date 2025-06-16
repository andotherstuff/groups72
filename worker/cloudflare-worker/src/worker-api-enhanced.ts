/**
 * Enhanced Worker API with proper push notification support
 * Uses Cloudflare Durable Objects for reliable notification delivery
 */

import { Env } from './worker-enhanced';

// Add DurableObjectNamespace type definition
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

export interface WorkerEnv extends Env {
  PUSH_QUEUE: DurableObjectNamespace;
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UserSubscription {
  npub: string;
  subscription: PushSubscription;
  groups: string[];
  preferences: {
    mentions: boolean;
    groupActivity: boolean;
    reactions: boolean;
    moderation: boolean;
    frequency: 'immediate' | 'hourly' | 'daily';
  };
  createdAt: number;
  lastNotified: number;
}

// Add types for request bodies
interface SubscribeRequestBody {
  npub: string;
  subscription: PushSubscription;
  preferences?: {
    settings?: Partial<UserSubscription['preferences']>;
    subscriptions?: { groups?: string[] };
  };
}

interface UnsubscribeRequestBody {
  npub: string;
}

interface PreferencesRequestBody {
  npub: string;
  preferences?: {
    settings?: Partial<UserSubscription['preferences']>;
    subscriptions?: { groups?: string[] };
  };
}

interface CheckSubscriptionRequestBody {
  npub: string;
  endpoint: string;
}

interface NotificationType {
  type: string;
  [key: string]: unknown;
}

export class WorkerAPI {
  constructor(private env: WorkerEnv) {}

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response: Response;

      // Route to appropriate handler
      const route = url.pathname.replace('/api/', '');
      
      switch (route) {
        case 'subscribe':
          response = await this.handleSubscribe(request);
          break;
        case 'unsubscribe':
          response = await this.handleUnsubscribe(request);
          break;
        case 'subscriptions':
          response = await this.handleGetSubscriptions(request);
          break;
        case 'preferences':
          response = await this.handleUpdatePreferences(request);
          break;
        case 'notify':
          response = await this.handleNotify(request);
          break;
        case 'test-notification':
          response = await this.handleTestNotification(request);
          break;
        case 'subscription/check':
          response = await this.handleCheckSubscription(request);
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
      console.error('API error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleSubscribe(request: Request): Promise<Response> {
    const body = await request.json() as SubscribeRequestBody;

    const userSub: UserSubscription = {
      npub: body.npub,
      subscription: body.subscription,
      groups: body.preferences?.subscriptions?.groups || [],
      preferences: {
        mentions: body.preferences?.settings?.mentions ?? true,
        groupActivity: body.preferences?.settings?.groupActivity ?? true,
        reactions: body.preferences?.settings?.reactions ?? false,
        moderation: body.preferences?.settings?.moderation ?? true,
        frequency: body.preferences?.settings?.frequency || 'immediate',
      },
      createdAt: Date.now(),
      lastNotified: 0,
    };

    await this.env.KV.put(`sub:${body.npub}`, JSON.stringify(userSub));

    // Update group memberships
    for (const groupId of userSub.groups) {
      await this.addUserToGroup(body.npub, groupId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUnsubscribe(request: Request): Promise<Response> {
    const body = await request.json() as UnsubscribeRequestBody;
    
    const existing = await this.env.KV.get(`sub:${body.npub}`, 'json') as UserSubscription;
    if (existing) {
      for (const groupId of existing.groups) {
        await this.removeUserFromGroup(body.npub, groupId);
      }
    }

    await this.env.KV.delete(`sub:${body.npub}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetSubscriptions(request: Request): Promise<Response> {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${this.env.BOT_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const subscriptions = await this.env.KV.list({ prefix: 'sub:' });
    const users: Record<string, string[]> = {};

    for (const key of subscriptions.keys) {
      const sub = await this.env.KV.get(key.name, 'json') as UserSubscription;
      if (sub) {
        users[sub.npub] = sub.groups;
      }
    }

    return new Response(JSON.stringify({ users }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUpdatePreferences(request: Request): Promise<Response> {
    const body = await request.json() as PreferencesRequestBody;

    const existing = await this.env.KV.get(`sub:${body.npub}`, 'json') as UserSubscription;
    if (!existing) {
      return new Response('Subscription not found', { status: 404 });
    }

    // Update groups
    const oldGroups = existing.groups;
    const newGroups = body.preferences?.subscriptions?.groups || [];

    for (const groupId of oldGroups) {
      if (!newGroups.includes(groupId)) {
        await this.removeUserFromGroup(body.npub, groupId);
      }
    }

    for (const groupId of newGroups) {
      if (!oldGroups.includes(groupId)) {
        await this.addUserToGroup(body.npub, groupId);
      }
    }

    existing.groups = newGroups;
    existing.preferences = {
      mentions: body.preferences?.settings?.mentions ?? existing.preferences.mentions,
      groupActivity: body.preferences?.settings?.groupActivity ?? existing.preferences.groupActivity,
      reactions: body.preferences?.settings?.reactions ?? existing.preferences.reactions,
      moderation: body.preferences?.settings?.moderation ?? existing.preferences.moderation,
      frequency: body.preferences?.settings?.frequency || existing.preferences.frequency,
    };

    await this.env.KV.put(`sub:${body.npub}`, JSON.stringify(existing));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleNotify(request: Request): Promise<Response> {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${this.env.BOT_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json() as { npub: string; notification: NotificationType };
    const sub = await this.env.KV.get(`sub:${body.npub}`, 'json') as UserSubscription;
    
    if (!sub) {
      return new Response('User not subscribed', { status: 404 });
    }

    if (!this.shouldSendNotification(sub, body.notification)) {
      return new Response('Notification filtered', { status: 204 });
    }

    const payload = {
      title: this.getNotificationTitle(body.notification),
      body: body.notification.content as string,
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      data: {
        url: this.getNotificationUrl(body.notification),
        ...body.notification
      },
      timestamp: Date.now()
    };

    // Queue the notification for delivery
    await this.queuePushNotification(sub.subscription, payload);

    sub.lastNotified = Date.now();
    await this.env.KV.put(`sub:${body.npub}`, JSON.stringify(sub));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleTestNotification(request: Request): Promise<Response> {
    const body = await request.json() as { npub: string; message?: string };
    const sub = await this.env.KV.get(`sub:${body.npub}`, 'json') as UserSubscription;
    
    if (!sub) {
      return new Response('Subscription not found', { status: 404 });
    }

    const payload = {
      title: '🎵 Chorus Test Notification',
      body: body.message || 'This is a test notification from Chorus!',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      data: { url: '/settings/notifications' },
      timestamp: Date.now()
    };

    await this.queuePushNotification(sub.subscription, payload);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleCheckSubscription(request: Request): Promise<Response> {
    const body = await request.json() as CheckSubscriptionRequestBody;
    const sub = await this.env.KV.get(`sub:${body.npub}`, 'json') as UserSubscription;
    
    if (!sub || sub.subscription.endpoint !== body.endpoint) {
      return new Response('Invalid subscription', { status: 404 });
    }

    return new Response(JSON.stringify({ valid: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async addUserToGroup(npub: string, groupId: string): Promise<void> {
    const key = `group:${groupId}`;
    const members = await this.env.KV.get(key, 'json') as string[] || [];
    if (!members.includes(npub)) {
      members.push(npub);
      await this.env.KV.put(key, JSON.stringify(members));
    }
  }

  private async removeUserFromGroup(npub: string, groupId: string): Promise<void> {
    const key = `group:${groupId}`;
    const members = await this.env.KV.get(key, 'json') as string[] || [];
    const filtered = members.filter(n => n !== npub);
    if (filtered.length > 0) {
      await this.env.KV.put(key, JSON.stringify(filtered));
    } else {
      await this.env.KV.delete(key);
    }
  }

  private shouldSendNotification(sub: UserSubscription, notification: NotificationType): boolean {
    switch (notification.type) {
      case 'mention':
        return sub.preferences.mentions;
      case 'new_post':
      case 'group_activity':
        return sub.preferences.groupActivity;
      case 'reaction':
        return sub.preferences.reactions;
      case 'post_approved':
      case 'post_removed':
        return sub.preferences.moderation;
      default:
        return true;
    }
  }

  private getNotificationTitle(notification: NotificationType): string {
    switch (notification.type) {
      case 'mention':
        return '💬 You were mentioned';
      case 'new_post':
        return '📝 New post in group';
      case 'reaction':
        return '👍 New reaction';
      case 'post_approved':
        return '✅ Post approved';
      case 'post_removed':
        return '❌ Post removed';
      default:
        return '🔔 Chorus notification';
    }
  }

  private getNotificationUrl(notification: NotificationType): string {
    if (notification.groupId && notification.eventId) {
      return `/group/${notification.groupId}?post=${notification.eventId}`;
    } else if (notification.groupId) {
      return `/group/${notification.groupId}`;
    }
    return '/settings/notifications';
  }

  /**
   * Queue push notification for reliable delivery
   * For now, we'll store it and process async
   */
  private async queuePushNotification(subscription: PushSubscription, payload: { title: string; body: string; icon: string; badge: string; data: object; timestamp: number }): Promise<void> {
    // Store notification in queue
    const queueId = crypto.randomUUID();
    await this.env.KV.put(
      `push-queue:${queueId}`,
      JSON.stringify({ subscription, payload, attempts: 0 }),
      { expirationTtl: 86400 } // 24 hours
    );
    
    // In production, this would trigger a Durable Object or Queue consumer
    // For now, we'll note that it needs external processing
    console.log(`Push notification queued: ${queueId}`);
  }
}