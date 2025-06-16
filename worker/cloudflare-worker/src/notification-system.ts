/**
 * Enhanced Notification System for Nostr Groups
 * YOLO: Tests on live relays, cleans up after
 */

import { NostrEvent, verifyEvent } from 'nostr-tools';

// Notification event types we care about
export const NOTIFICATION_EVENT_KINDS = {
  GROUP_POST: 42,
  REACTION: 7,
  MODERATION: 9005,
  DELETE: 5,
  GROUP_META: 39000,
  GROUP_ADMIN: 39001
};

export interface NotificationTrigger {
  eventId: string;
  type: 'mention' | 'group_activity' | 'moderation' | 'keyword' | 'reaction';
  priority: 'high' | 'normal' | 'low';
  targetNpubs: string[];
  groupId?: string;
  content: string;
  timestamp: number;
}

export interface UserPreferences {
  npub: string;
  pushEndpoint: string;
  vapidAuth: string;
  p256dh: string;
  subscriptions: {
    groups: string[];
    keywords: string[];
    authors: string[];
  };
  settings: {
    mentions: boolean;
    groupActivity: boolean;
    reactions: boolean;
    moderation: boolean;
    frequency: 'immediate' | 'hourly' | 'daily';
    quietHours?: {
      start: number; // hour (0-23)
      end: number;
      timezone: string;
    };
  };
  lastNotified: number;
  notificationCount: number;
}

export class NotificationSystem {
  private queue = new Map<string, NotificationTrigger[]>();
  
  constructor(private env: unknown) {}

  /**
   * Process a Nostr event and determine if it triggers notifications
   */
  async processEvent(event: NostrEvent): Promise<NotificationTrigger[]> {
    const triggers: NotificationTrigger[] = [];

    // Verify event signature
    if (!verifyEvent(event)) {
      console.warn('Invalid event signature:', event.id);
      return triggers;
    }

    // Extract mentions
    const mentions = this.extractMentions(event);
    if (mentions.length > 0) {
      triggers.push({
        eventId: event.id,
        type: 'mention',
        priority: 'high',
        targetNpubs: mentions,
        groupId: this.extractGroupId(event),
        content: event.content.substring(0, 100),
        timestamp: event.created_at
      });
    }

    // Check for moderation actions
    if (event.kind === NOTIFICATION_EVENT_KINDS.MODERATION) {
      const targetPubkey = event.tags.find(t => t[0] === 'p')?.[1];
      if (targetPubkey) {
        triggers.push({
          eventId: event.id,
          type: 'moderation',
          priority: 'high',
          targetNpubs: [targetPubkey],
          groupId: this.extractGroupId(event),
          content: 'Moderation action: ' + event.content.substring(0, 50),
          timestamp: event.created_at
        });
      }
    }

    // Check for keyword matches
    const keywordTriggers = await this.checkKeywordSubscriptions(event);
    triggers.push(...keywordTriggers);

    // Group activity for subscribers
    if (event.kind === NOTIFICATION_EVENT_KINDS.GROUP_POST) {
      const groupId = this.extractGroupId(event);
      if (groupId) {
        const subscribers = await this.getGroupSubscribers(groupId);
        if (subscribers.length > 0) {
          triggers.push({
            eventId: event.id,
            type: 'group_activity',
            priority: 'normal',
            targetNpubs: subscribers,
            groupId,
            content: event.content.substring(0, 100),
            timestamp: event.created_at
          });
        }
      }
    }

    return triggers;
  }

  /**
   * Extract mentions from event content and tags
   */
  private extractMentions(event: NostrEvent): string[] {
    const mentions = new Set<string>();

    // Extract from p tags
    event.tags
      .filter(tag => tag[0] === 'p')
      .forEach(tag => mentions.add(tag[1]));

    // Extract from content (@npub... pattern)
    const npubPattern = /@(npub[a-z0-9]{59})/gi;
    const matches = event.content.matchAll(npubPattern);
    for (const match of matches) {
      // Convert npub to hex if needed
      mentions.add(match[1]);
    }

    return Array.from(mentions);
  }

  /**
   * Extract group ID from event tags
   */
  private extractGroupId(event: NostrEvent): string | undefined {
    return event.tags.find(tag => tag[0] === 'h')?.[1];
  }

  /**
   * Check if event matches any keyword subscriptions
   */
  private async checkKeywordSubscriptions(event: NostrEvent): Promise<NotificationTrigger[]> {
    const triggers: NotificationTrigger[] = [];
    
    // Get all users with keyword subscriptions
    const keywordSubs = await this.env.KV.list({ prefix: 'keywords:' });
    
    for (const key of keywordSubs.keys) {
      const keyword = key.name.replace('keywords:', '');
      if (event.content.toLowerCase().includes(keyword.toLowerCase())) {
        const subscribers = await this.env.KV.get(key.name, 'json') as string[];
        
        // Determine priority based on keyword
        const urgentKeywords = ['urgent', 'emergency', 'action', 'important'];
        const priority = urgentKeywords.includes(keyword.toLowerCase()) ? 'high' : 'normal';
        
        triggers.push({
          eventId: event.id,
          type: 'keyword',
          priority,
          targetNpubs: subscribers,
          groupId: this.extractGroupId(event),
          content: `Keyword "${keyword}": ${event.content.substring(0, 80)}`,
          timestamp: event.created_at
        });
      }
    }
    
    return triggers;
  }

  /**
   * Get subscribers for a specific group
   */
  private async getGroupSubscribers(groupId: string): Promise<string[]> {
    const subscribers = await this.env.KV.get(`group:${groupId}:subscribers`, 'json');
    return subscribers || [];
  }

  /**
   * Queue notification for delivery
   */
  async queueNotification(trigger: NotificationTrigger): Promise<void> {
    for (const npub of trigger.targetNpubs) {
      // Check user preferences
      const prefs = await this.getUserPreferences(npub);
      if (!prefs || !this.shouldNotify(prefs, trigger)) {
        continue;
      }

      // Add to queue
      if (!this.queue.has(npub)) {
        this.queue.set(npub, []);
      }
      this.queue.get(npub)!.push(trigger);

      // Send immediately for high priority
      if (trigger.priority === 'high' || prefs.settings.frequency === 'immediate') {
        await this.flushUserQueue(npub);
      }
    }
  }

  /**
   * Check if user should be notified based on preferences
   */
  private shouldNotify(prefs: UserPreferences, trigger: NotificationTrigger): boolean {
    // Check notification type settings
    switch (trigger.type) {
      case 'mention':
        if (!prefs.settings.mentions) return false;
        break;
      case 'group_activity':
        if (!prefs.settings.groupActivity) return false;
        break;
      case 'moderation':
        if (!prefs.settings.moderation) return false;
        break;
      case 'reaction':
        if (!prefs.settings.reactions) return false;
        break;
    }

    // Check quiet hours
    if (prefs.settings.quietHours && trigger.priority !== 'high') {
      const now = new Date();
      const hour = now.getHours();
      const { start, end } = prefs.settings.quietHours;
      
      if (start > end) {
        // Quiet hours span midnight
        if (hour >= start || hour < end) return false;
      } else {
        if (hour >= start && hour < end) return false;
      }
    }

    // Rate limiting - max 10 notifications per hour
    const hourAgo = Date.now() - 3600000;
    if (prefs.notificationCount > 10 && prefs.lastNotified > hourAgo) {
      return false;
    }

    return true;
  }

  /**
   * Get user preferences from KV
   */
  private async getUserPreferences(npub: string): Promise<UserPreferences | null> {
    return await this.env.KV.get(`user:${npub}`, 'json');
  }

  /**
   * Flush notification queue for a specific user
   */
  private async flushUserQueue(npub: string): Promise<void> {
    const notifications = this.queue.get(npub);
    if (!notifications || notifications.length === 0) return;

    const prefs = await this.getUserPreferences(npub);
    if (!prefs) return;

    // Aggregate notifications
    const aggregated = this.aggregateNotifications(notifications);

    // Send push notification
    await this.sendPushNotification(prefs, aggregated);

    // Update user stats
    await this.updateUserStats(npub, notifications.length);

    // Clear queue
    this.queue.delete(npub);
  }

  /**
   * Aggregate multiple notifications into a single message
   */
  private aggregateNotifications(notifications: NotificationTrigger[]): {
    title: string;
    body: string;
    data: unknown;
  } {
    if (notifications.length === 1) {
      const n = notifications[0];
      return {
        title: this.getNotificationTitle(n),
        body: n.content,
        data: {
          eventId: n.eventId,
          groupId: n.groupId,
          type: n.type
        }
      };
    }

    // Multiple notifications
    const mentions = notifications.filter(n => n.type === 'mention').length;
    const activities = notifications.filter(n => n.type === 'group_activity').length;
    
    return {
      title: `${notifications.length} new notifications`,
      body: [
        mentions > 0 && `${mentions} mention${mentions > 1 ? 's' : ''}`,
        activities > 0 && `${activities} group update${activities > 1 ? 's' : ''}`
      ].filter(Boolean).join(', '),
      data: {
        eventIds: notifications.map(n => n.eventId),
        groupIds: [...new Set(notifications.map(n => n.groupId).filter(Boolean))]
      }
    };
  }

  /**
   * Get notification title based on type
   */
  private getNotificationTitle(notification: NotificationTrigger): string {
    switch (notification.type) {
      case 'mention':
        return '💬 You were mentioned';
      case 'group_activity':
        return `📢 Activity in ${notification.groupId}`;
      case 'moderation':
        return '🛡️ Moderation notice';
      case 'keyword':
        return '🔔 Keyword alert';
      case 'reaction':
        return '👍 New reaction';
      default:
        return '📬 New notification';
    }
  }

  /**
   * Send push notification via API
   */
  private async sendPushNotification(
    user: UserPreferences,
    notification: { title: string; body: string; data: unknown }
  ): Promise<void> {
    const payload = {
      endpoint: user.pushEndpoint,
      keys: {
        p256dh: user.p256dh,
        auth: user.vapidAuth
      },
      payload: JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        data: notification.data,
        timestamp: Date.now()
      })
    };

    const response = await fetch(this.env.PUSH_DISPATCH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.BOT_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Push API error: ${response.status}`);
    }
  }

  /**
   * Update user notification stats
   */
  private async updateUserStats(npub: string, count: number): Promise<void> {
    const prefs = await this.getUserPreferences(npub);
    if (prefs) {
      prefs.lastNotified = Date.now();
      prefs.notificationCount = (prefs.notificationCount || 0) + count;
      await this.env.KV.put(`user:${npub}`, JSON.stringify(prefs));
    }
  }

  /**
   * Flush all queued notifications
   */
  async flushAll(): Promise<void> {
    const flushPromises = Array.from(this.queue.keys()).map(npub => 
      this.flushUserQueue(npub)
    );
    await Promise.all(flushPromises);
  }
}
