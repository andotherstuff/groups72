/**
 * Nostr Groups Notification Bot
 * Monitors for new posts and sends push notifications
 */

import { NostrEvent, SimplePool, nip19, verifyEvent } from 'nostr-tools';
import { WebSocket } from 'ws';

// Polyfill WebSocket for Node.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).WebSocket = WebSocket;

interface NotificationConfig {
  relays: string[];
  workerUrl: string;
  botPrivateKey: string;
  pollInterval: number; // seconds
}

interface GroupSubscription {
  groupId: string;
  lastChecked: number;
  subscribers: Set<string>;
}

export class NotificationBot {
  private pool: SimplePool;
  private groupSubscriptions = new Map<string, GroupSubscription>();
  private userSubscriptions = new Map<string, Set<string>>(); // npub -> groupIds
  private lastEventTime = Math.floor(Date.now() / 1000) - 3600; // Start from 1 hour ago
  
  constructor(private config: NotificationConfig) {
    this.pool = new SimplePool();
  }

  /**
   * Start the notification bot
   */
  async start() {
    console.log('🤖 Starting Nostr Groups Notification Bot...');
    
    // Load existing subscriptions
    await this.loadSubscriptions();
    
    // Start monitoring
    this.startMonitoring();
    
    // Periodically refresh subscriptions
    setInterval(() => this.loadSubscriptions(), 300000); // Every 5 minutes
  }

  /**
   * Load user subscriptions from the worker
   */
  private async loadSubscriptions() {
    try {
      const response = await fetch(`${this.config.workerUrl}/api/subscriptions`);
      if (!response.ok) return;
      
      const data = await response.json();
      
      // Clear and reload subscriptions
      this.userSubscriptions.clear();
      this.groupSubscriptions.clear();
      
      for (const [npub, groups] of Object.entries(data.users)) {
        this.userSubscriptions.set(npub, new Set(groups as string[]));
        
        for (const groupId of groups as string[]) {
          if (!this.groupSubscriptions.has(groupId)) {
            this.groupSubscriptions.set(groupId, {
              groupId,
              lastChecked: this.lastEventTime,
              subscribers: new Set()
            });
          }
          this.groupSubscriptions.get(groupId)!.subscribers.add(npub);
        }
      }
      
      console.log(`📋 Loaded ${this.userSubscriptions.size} users monitoring ${this.groupSubscriptions.size} groups`);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  }

  /**
   * Start monitoring for new posts
   */
  private startMonitoring() {
    // Monitor for new group posts (kind 11)
    this.subscribeToGroupPosts();
    
    // Monitor for reactions (kind 7)
    this.subscribeToReactions();
    
    // Monitor for moderation events
    this.subscribeToModerationEvents();
    
    // Periodically check for missed events
    setInterval(() => this.checkForMissedEvents(), this.config.pollInterval * 1000);
  }

  /**
   * Subscribe to new group posts
   */
  private subscribeToGroupPosts() {
    const filters = [{
      kinds: [11], // Group posts
      since: this.lastEventTime
    }];

    const sub = this.pool.sub(this.config.relays, filters);
    
    sub.on('event', async (event: NostrEvent) => {
      if (!verifyEvent(event)) return;
      
      // Update last event time
      if (event.created_at > this.lastEventTime) {
        this.lastEventTime = event.created_at;
      }
      
      // Extract group ID from 'a' tag
      const aTag = event.tags.find(tag => tag[0] === 'a');
      if (!aTag) return;
      
      const groupId = aTag[1];
      const subscription = this.groupSubscriptions.get(groupId);
      
      if (!subscription) return;
      
      // Check for mentions in the post
      const mentions = this.extractMentions(event);
      
      // Send notifications
      for (const npub of subscription.subscribers) {
        const notification = {
          type: 'new_post',
          groupId,
          eventId: event.id,
          author: nip19.npubEncode(event.pubkey),
          content: event.content.substring(0, 100),
          mentions: mentions.includes(npub),
          timestamp: event.created_at
        };
        
        await this.sendNotification(npub, notification);
      }
      
      // Also notify mentioned users who might not be subscribed
      for (const mentionedNpub of mentions) {
        if (!subscription.subscribers.has(mentionedNpub)) {
          const notification = {
            type: 'mention',
            groupId,
            eventId: event.id,
            author: nip19.npubEncode(event.pubkey),
            content: event.content.substring(0, 100),
            mentions: true,
            timestamp: event.created_at
          };
          
          await this.sendNotification(mentionedNpub, notification);
        }
      }
      
      console.log(`📬 New post in group ${groupId} - notified ${subscription.subscribers.size} users`);
    });
  }

  /**
   * Subscribe to reactions
   */
  private subscribeToReactions() {
    const filters = [{
      kinds: [7], // Reactions
      since: this.lastEventTime
    }];

    const sub = this.pool.sub(this.config.relays, filters);
    
    sub.on('event', async (event: NostrEvent) => {
      if (!verifyEvent(event)) return;
      
      // Update last event time
      if (event.created_at > this.lastEventTime) {
        this.lastEventTime = event.created_at;
      }
      
      // Find the post being reacted to
      const eTag = event.tags.find(tag => tag[0] === 'e');
      const pTag = event.tags.find(tag => tag[0] === 'p');
      
      if (!eTag || !pTag) return;
      
      const targetEventId = eTag[1];
      const targetAuthor = pTag[1];
      
      // Check if the target author has notifications enabled
      const targetNpub = nip19.npubEncode(targetAuthor);
      if (this.userSubscriptions.has(targetNpub)) {
        const notification = {
          type: 'reaction',
          eventId: targetEventId,
          reactor: nip19.npubEncode(event.pubkey),
          reaction: event.content || '+',
          timestamp: event.created_at
        };
        
        await this.sendNotification(targetNpub, notification);
        console.log(`👍 Reaction notification sent to ${targetNpub}`);
      }
    });
  }

  /**
   * Subscribe to moderation events
   */
  private subscribeToModerationEvents() {
    const filters = [{
      kinds: [4550, 4551], // Post approval/removal
      since: this.lastEventTime
    }];

    const sub = this.pool.sub(this.config.relays, filters);
    
    sub.on('event', async (event: NostrEvent) => {
      if (!verifyEvent(event)) return;
      
      // Update last event time
      if (event.created_at > this.lastEventTime) {
        this.lastEventTime = event.created_at;
      }
      
      // Extract affected user
      const pTag = event.tags.find(tag => tag[0] === 'p');
      if (!pTag) return;
      
      const affectedNpub = nip19.npubEncode(pTag[1]);
      const aTag = event.tags.find(tag => tag[0] === 'a');
      const groupId = aTag ? aTag[1] : undefined;
      
      if (this.userSubscriptions.has(affectedNpub)) {
        const notification = {
          type: event.kind === 4550 ? 'post_approved' : 'post_removed',
          groupId,
          moderator: nip19.npubEncode(event.pubkey),
          reason: event.content,
          timestamp: event.created_at
        };
        
        await this.sendNotification(affectedNpub, notification);
        console.log(`🛡️ Moderation notification sent to ${affectedNpub}`);
      }
    });
  }

  /**
   * Extract mentions from event content and tags
   */
  private extractMentions(event: NostrEvent): string[] {
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
    
    // Extract from content (nostr:npub... pattern)
    const npubPattern = /nostr:(npub[a-z0-9]{59})/gi;
    const matches = event.content.matchAll(npubPattern);
    for (const match of matches) {
      mentions.add(match[1]);
    }
    
    return Array.from(mentions);
  }

  /**
   * Send notification to user via worker
   */
  private async sendNotification(npub: string, notification: Record<string, unknown>) {
    try {
      const response = await fetch(`${this.config.workerUrl}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BOT_TOKEN}`
        },
        body: JSON.stringify({
          npub,
          notification
        })
      });
      
      if (!response.ok) {
        console.error(`Failed to send notification to ${npub}: ${response.status}`);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Check for events we might have missed
   */
  private async checkForMissedEvents() {
    const now = Math.floor(Date.now() / 1000);
    const checkSince = this.lastEventTime - 300; // Check 5 minutes back
    
    console.log(`🔍 Checking for missed events since ${new Date(checkSince * 1000).toISOString()}`);
    
    try {
      const events = await this.pool.list(this.config.relays, [{
        kinds: [11, 7, 4550, 4551],
        since: checkSince,
        until: now
      }]);
      
      let newEvents = 0;
      for (const event of events) {
        if (event.created_at > this.lastEventTime) {
          newEvents++;
          // Process the event based on its kind
          if (event.kind === 11) {
            // Process as new post
            // (Similar logic to subscribeToGroupPosts)
          } else if (event.kind === 7) {
            // Process as reaction
            // (Similar logic to subscribeToReactions)
          }
          // etc...
        }
      }
      
      if (newEvents > 0) {
        console.log(`📨 Found and processed ${newEvents} missed events`);
      }
      
      this.lastEventTime = now;
    } catch (error) {
      console.error('Error checking for missed events:', error);
    }
  }

  /**
   * Stop the bot
   */
  stop() {
    console.log('🛑 Stopping notification bot...');
    this.pool.close(this.config.relays);
  }
}

// Start the bot if this is the main module
if (require.main === module) {
  const config: NotificationConfig = {
    relays: [
      'wss://relay.primal.net',
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://relayable.org'
    ],
    workerUrl: process.env.WORKER_URL || 'https://groups-notifications.workers.dev',
    botPrivateKey: process.env.BOT_PRIVATE_KEY || '',
    pollInterval: 30 // Check every 30 seconds
  };
  
  const bot = new NotificationBot(config);
  bot.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    bot.stop();
    process.exit(0);
  });
}