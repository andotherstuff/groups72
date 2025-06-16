/**
 * Enhanced Nostr Groups Notification Bot
 * Properly tracks group memberships and filters events
 */

import { NostrEvent, SimplePool, nip19, verifyEvent, Filter } from 'nostr-tools';
import { WebSocket } from 'ws';

// Polyfill WebSocket for Node.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).WebSocket = WebSocket;

interface NotificationConfig {
  relays: string[];
  workerUrl: string;
  botToken: string;
  pollInterval: number; // seconds
}

interface GroupData {
  id: string; // 34550:pubkey:identifier
  pubkey: string;
  identifier: string;
  members: Set<string>; // Set of npubs
}

interface UserData {
  npub: string;
  groups: Set<string>; // Set of group IDs
  preferences: {
    mentions: boolean;
    groupActivity: boolean;
    reactions: boolean;
    moderation: boolean;
  };
}

export class EnhancedNotificationBot {
  private pool: SimplePool;
  private groups = new Map<string, GroupData>();
  private users = new Map<string, UserData>();
  private lastEventTime = Math.floor(Date.now() / 1000) - 3600; // Start from 1 hour ago
  private processedEvents = new Set<string>(); // Track processed event IDs
  
  constructor(private config: NotificationConfig) {
    this.pool = new SimplePool();
  }

  /**
   * Start the notification bot
   */
  async start() {
    console.log('🤖 Starting Enhanced Nostr Groups Notification Bot...');
    console.log(`📡 Connecting to relays: ${this.config.relays.join(', ')}`);
    
    // Load initial data
    await this.loadSubscriptions();
    await this.loadGroupMemberships();
    
    // Start monitoring
    this.startMonitoring();
    
    // Periodically refresh data
    setInterval(() => this.loadSubscriptions(), 300000); // Every 5 minutes
    setInterval(() => this.loadGroupMemberships(), 600000); // Every 10 minutes
    
    console.log('✅ Bot is running!');
  }

  /**
   * Load user subscriptions from the worker
   */
  private async loadSubscriptions() {
    try {
      console.log('📋 Loading user subscriptions...');
      
      const response = await fetch(`${this.config.workerUrl}/api/subscriptions`, {
        headers: {
          'Authorization': `Bearer ${this.config.botToken}`
        }
      });
      
      if (!response.ok) {
        console.error('Failed to load subscriptions:', response.status);
        return;
      }
      
      const data = await response.json() as { users: Record<string, string[]> };
      
      // Clear and reload
      this.users.clear();
      this.groups.clear();
      
      for (const [npub, groupIds] of Object.entries(data.users)) {
        this.users.set(npub, {
          npub,
          groups: new Set(groupIds),
          preferences: {
            mentions: true,
            groupActivity: true,
            reactions: true,
            moderation: true
          }
        });
        
        // Extract group data
        for (const groupId of groupIds) {
          if (!this.groups.has(groupId)) {
            const [kind, pubkey, identifier] = groupId.split(':');
            if (kind === '34550') {
              this.groups.set(groupId, {
                id: groupId,
                pubkey,
                identifier,
                members: new Set()
              });
            }
          }
          this.groups.get(groupId)?.members.add(npub);
        }
      }
      
      console.log(`✅ Loaded ${this.users.size} users in ${this.groups.size} groups`);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  }

  /**
   * Load actual group memberships from relays
   */
  private async loadGroupMemberships() {
    if (this.groups.size === 0) return;
    
    console.log('👥 Loading group memberships from relays...');
    
    try {
      // Fetch group metadata events
      const groupFilters: Filter[] = Array.from(this.groups.values()).map(group => ({
        kinds: [34550], // Group metadata
        authors: [group.pubkey],
        '#d': [group.identifier]
      }));
      
      const groupEvents = await this.pool.list(this.config.relays, groupFilters);
      
      for (const event of groupEvents) {
        const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
        if (!dTag) continue;
        
        const groupId = `34550:${event.pubkey}:${dTag}`;
        const group = this.groups.get(groupId);
        if (!group) continue;
        
        // Extract members from 'p' tags
        const memberPubkeys = event.tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1]);
        
        // Convert pubkeys to npubs and update membership
        for (const pubkey of memberPubkeys) {
          try {
            const npub = nip19.npubEncode(pubkey);
            group.members.add(npub);
          } catch (e) {
            // Invalid pubkey
          }
        }
      }
      
      console.log('✅ Group memberships loaded');
    } catch (error) {
      console.error('Error loading group memberships:', error);
    }
  }

  /**
   * Start monitoring for events
   */
  private startMonitoring() {
    // Monitor different event types with appropriate filters
    this.monitorGroupPosts();
    this.monitorMentions();
    this.monitorReactions();
    this.monitorModerationEvents();
    
    // Periodically check for missed events
    setInterval(() => this.checkForMissedEvents(), this.config.pollInterval * 1000);
  }

  /**
   * Monitor for new posts in subscribed groups
   */
  private monitorGroupPosts() {
    if (this.groups.size === 0) return;
    
    // Create filters for each group
    const filters: Filter[] = Array.from(this.groups.values()).map(group => ({
      kinds: [11], // Group posts
      '#a': [`34550:${group.pubkey}:${group.identifier}`],
      since: this.lastEventTime
    }));
    
    const sub = this.pool.subscribeMany(this.config.relays, filters, {
      onevent: async (event: NostrEvent) => {
        if (!this.shouldProcessEvent(event)) return;
        
        // Extract group ID from 'a' tag
        const aTag = event.tags.find(tag => tag[0] === 'a')?.[1];
        if (!aTag) return;
        
        const group = this.groups.get(aTag);
        if (!group) return;
        
        console.log(`📬 New post in group ${group.identifier}`);
        
        // Check for mentions in the post
        const mentions = this.extractMentions(event);
        
        // Notify group members
        for (const memberNpub of group.members) {
          const user = this.users.get(memberNpub);
          if (!user || !user.preferences.groupActivity) continue;
          
          // Skip the author
          const authorNpub = nip19.npubEncode(event.pubkey);
          if (authorNpub === memberNpub) continue;
          
          await this.sendNotification(memberNpub, {
            type: mentions.includes(memberNpub) ? 'mention' : 'new_post',
            groupId: aTag,
            eventId: event.id,
            author: authorNpub,
            content: event.content.substring(0, 100),
            mentions: mentions.includes(memberNpub),
            timestamp: event.created_at
          });
        }
        
        // Also notify mentioned users who aren't group members
        for (const mentionedNpub of mentions) {
          if (!group.members.has(mentionedNpub)) {
            await this.sendNotification(mentionedNpub, {
              type: 'mention',
              groupId: aTag,
              eventId: event.id,
              author: nip19.npubEncode(event.pubkey),
              content: event.content.substring(0, 100),
              mentions: true,
              timestamp: event.created_at
            });
          }
        }
      }
    });
  }

  /**
   * Monitor for mentions across all events
   */
  private monitorMentions() {
    // Get all tracked user pubkeys
    const userPubkeys = Array.from(this.users.keys()).map(npub => {
      try {
        return nip19.decode(npub).data as string;
      } catch (e) {
        return null;
      }
    }).filter(Boolean) as string[];
    
    if (userPubkeys.length === 0) return;
    
    const filters: Filter[] = [{
      kinds: [1, 11, 1111], // Text notes, group posts, replies
      '#p': userPubkeys,
      since: this.lastEventTime
    }];
    
    const sub = this.pool.subscribeMany(this.config.relays, filters, {
      onevent: async (event: NostrEvent) => {
        if (!this.shouldProcessEvent(event)) return;
        
        // Find mentioned users
        const mentionedPubkeys = event.tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1]);
        
        for (const pubkey of mentionedPubkeys) {
          try {
            const npub = nip19.npubEncode(pubkey);
            const user = this.users.get(npub);
            if (!user || !user.preferences.mentions) continue;
            
            // Don't notify about self-mentions
            if (event.pubkey === pubkey) continue;
            
            await this.sendNotification(npub, {
              type: 'mention',
              eventId: event.id,
              author: nip19.npubEncode(event.pubkey),
              content: event.content.substring(0, 100),
              timestamp: event.created_at
            });
          } catch (e) {
            // Invalid pubkey
          }
        }
      }
    });
  }

  /**
   * Monitor for reactions to tracked users' posts
   */
  private monitorReactions() {
    const userPubkeys = Array.from(this.users.keys()).map(npub => {
      try {
        return nip19.decode(npub).data as string;
      } catch (e) {
        return null;
      }
    }).filter(Boolean) as string[];
    
    if (userPubkeys.length === 0) return;
    
    const filters: Filter[] = [{
      kinds: [7], // Reactions
      '#p': userPubkeys,
      since: this.lastEventTime
    }];
    
    const sub = this.pool.subscribeMany(this.config.relays, filters, {
      onevent: async (event: NostrEvent) => {
        if (!this.shouldProcessEvent(event)) return;
        
        const pTag = event.tags.find(tag => tag[0] === 'p')?.[1];
        const eTag = event.tags.find(tag => tag[0] === 'e')?.[1];
        
        if (!pTag || !eTag) return;
        
        try {
          const targetNpub = nip19.npubEncode(pTag);
          const user = this.users.get(targetNpub);
          
          if (!user || !user.preferences.reactions) return;
          
          // Don't notify about self-reactions
          if (event.pubkey === pTag) return;
          
          await this.sendNotification(targetNpub, {
            type: 'reaction',
            eventId: eTag,
            reactor: nip19.npubEncode(event.pubkey),
            reaction: event.content || '+',
            timestamp: event.created_at
          });
        } catch (e) {
          // Invalid pubkey
        }
      }
    });
  }

  /**
   * Monitor for moderation events
   */
  private monitorModerationEvents() {
    if (this.groups.size === 0) return;
    
    // Monitor for post approvals/removals in tracked groups
    const filters: Filter[] = Array.from(this.groups.values()).map(group => ({
      kinds: [4550, 4551], // Post approval/removal
      '#a': [`34550:${group.pubkey}:${group.identifier}`],
      since: this.lastEventTime
    }));
    
    const sub = this.pool.subscribeMany(this.config.relays, filters, {
      onevent: async (event: NostrEvent) => {
        if (!this.shouldProcessEvent(event)) return;
        
        const pTag = event.tags.find(tag => tag[0] === 'p')?.[1];
        const aTag = event.tags.find(tag => tag[0] === 'a')?.[1];
        
        if (!pTag || !aTag) return;
        
        try {
          const affectedNpub = nip19.npubEncode(pTag);
          const user = this.users.get(affectedNpub);
          
          if (!user || !user.preferences.moderation) return;
          
          await this.sendNotification(affectedNpub, {
            type: event.kind === 4550 ? 'post_approved' : 'post_removed',
            groupId: aTag,
            moderator: nip19.npubEncode(event.pubkey),
            reason: event.content,
            timestamp: event.created_at
          });
        } catch (e) {
          // Invalid pubkey
        }
      }
    });
  }

  /**
   * Check if we should process this event
   */
  private shouldProcessEvent(event: NostrEvent): boolean {
    // Verify event
    if (!verifyEvent(event)) {
      console.warn('Invalid event signature:', event.id);
      return false;
    }
    
    // Check if already processed
    if (this.processedEvents.has(event.id)) {
      return false;
    }
    
    // Update tracking
    this.processedEvents.add(event.id);
    
    // Keep set size manageable
    if (this.processedEvents.size > 10000) {
      const toDelete = Array.from(this.processedEvents).slice(0, 5000);
      toDelete.forEach(id => this.processedEvents.delete(id));
    }
    
    // Update last event time
    if (event.created_at > this.lastEventTime) {
      this.lastEventTime = event.created_at;
    }
    
    return true;
  }

  /**
   * Extract mentions from event
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
          'Authorization': `Bearer ${this.config.botToken}`
        },
        body: JSON.stringify({
          npub,
          notification
        })
      });
      
      if (!response.ok && response.status !== 204) {
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
    
    console.log(`🔍 Checking for missed events...`);
    
    // Create comprehensive filters
    const filters: Filter[] = [];
    
    // Group posts
    if (this.groups.size > 0) {
      filters.push(...Array.from(this.groups.values()).map(group => ({
        kinds: [11],
        '#a': [`34550:${group.pubkey}:${group.identifier}`],
        since: checkSince,
        until: now
      })));
    }
    
    // Mentions and reactions
    const userPubkeys = Array.from(this.users.keys()).map(npub => {
      try {
        return nip19.decode(npub).data as string;
      } catch (e) {
        return null;
      }
    }).filter(Boolean) as string[];
    
    if (userPubkeys.length > 0) {
      filters.push({
        kinds: [1, 7, 1111],
        '#p': userPubkeys,
        since: checkSince,
        until: now
      });
    }
    
    if (filters.length === 0) return;
    
    try {
      const events = await this.pool.querySync(this.config.relays, filters);
      let newEvents = 0;
      
      for (const event of events) {
        if (!this.processedEvents.has(event.id)) {
          newEvents++;
          // Process based on kind
          // (Implementation similar to the subscription handlers above)
        }
      }
      
      if (newEvents > 0) {
        console.log(`📨 Found ${newEvents} missed events`);
      }
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
    botToken: process.env.BOT_TOKEN || '',
    pollInterval: 30 // Check every 30 seconds
  };
  
  if (!config.botToken) {
    console.error('❌ BOT_TOKEN environment variable is required');
    process.exit(1);
  }
  
  const bot = new EnhancedNotificationBot(config);
  bot.start().catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    bot.stop();
    process.exit(0);
  });
}