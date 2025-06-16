/**
 * Enhanced Nostr Push Notification Worker
 * Monitors all user activity and sends targeted push notifications
 * Supports all notification types from the +chorus application
 */

// Configuration constants
const WORKER_CONFIG = {
  POLL_INTERVAL: 30 * 60 * 1000, // 30 minutes
  MAX_EVENTS_PER_POLL: 100,
  NOTIFICATION_TYPES: {
    GROUP_UPDATE: 'group_update',
    TAG_POST: 'tag_post', 
    TAG_REPLY: 'tag_reply',
    REACTION: 'reaction',
    POST_APPROVED: 'post_approved',
    POST_REMOVED: 'post_removed',
    JOIN_REQUEST: 'join_request',
    LEAVE_REQUEST: 'leave_request',
    REPORT: 'report',
    REPORT_ACTION: 'report_action'
  },
  NOSTR_KINDS: {
    METADATA: 0,         // User profiles
    TEXT_NOTE: 1,        // Text posts
    REACTION: 7,         // Reactions/likes
    TAG_POST: 11,        // Tag in post
    TAG_REPLY: 1111,     // Tag in reply
    REPORT: 1984,        // Reports
    COMMUNITY: 34550,    // Community definition
    POST_APPROVAL: 4550, // Post approval
    POST_REQUEST: 4551,  // Post request/removal
    JOIN_REQUEST: 4552,  // Join request
    LEAVE_REQUEST: 4553, // Leave request
    REPORT_ACTION: 4554  // Report action
  }
};

// Enhanced user data structure
class UserProfile {
  constructor(data) {
    this.npub = data.npub;
    this.pubkey = data.pubkey;
    this.subscription = data.subscription; // Push subscription data
    this.preferences = data.preferences || this.getDefaultPreferences();
    this.groups = data.groups || [];
    this.adminGroups = data.adminGroups || [];
    this.moderatedGroups = data.moderatedGroups || [];
    this.lastSeen = data.lastSeen || 0;
    this.isOnline = data.isOnline || false;
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = Date.now();
  }

  getDefaultPreferences() {
    return {
      groupUpdates: true,
      mentions: true,
      reactions: true,
      joinRequests: true,
      reports: true,
      reportActions: true,
      postApprovals: true,
      quietHours: false,
      quietStart: 22, // 10 PM
      quietEnd: 8     // 8 AM
    };
  }

  shouldReceiveNotification(type, timestamp = Date.now()) {
    if (!this.preferences[type] && type !== 'mentions') return false;
    
    // Check quiet hours
    if (this.preferences.quietHours) {
      const hour = new Date(timestamp).getHours();
      if (hour >= this.preferences.quietStart || hour <= this.preferences.quietEnd) {
        return false;
      }
    }

    // Don't send if user was recently online (within 5 minutes)
    if (this.isOnline || (timestamp - this.lastSeen) < 5 * 60 * 1000) {
      return false;
    }

    return true;
  }

  isAdminOf(groupId) {
    return this.adminGroups.includes(groupId);
  }

  isModeratorOf(groupId) {
    return this.moderatedGroups.includes(groupId) || this.isAdminOf(groupId);
  }

  isMemberOf(groupId) {
    return this.groups.includes(groupId);
  }
}

// Notification builder
class NotificationBuilder {
  constructor() {
    this.notifications = [];
  }

  addNotification(userId, type, data) {
    this.notifications.push({
      userId,
      type,
      timestamp: Date.now(),
      data: {
        title: this.getTitle(type, data),
        body: this.getBody(type, data),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        tag: data.eventId || type,
        data: {
          type,
          eventId: data.eventId,
          groupId: data.groupId,
          pubkey: data.pubkey,
          url: this.getNotificationUrl(type, data)
        },
        requireInteraction: this.requiresInteraction(type),
        actions: this.getActions(type, data)
      }
    });
  }

  getTitle(type, data) {
    const authorName = data.authorName || 'Someone';
    const groupName = data.groupName || 'a group';

    switch (type) {
      case WORKER_CONFIG.NOTIFICATION_TYPES.TAG_POST:
        return `${authorName} tagged you`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.TAG_REPLY:
        return `${authorName} tagged you in a reply`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.REACTION:
        return `${authorName} reacted to your post`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.GROUP_UPDATE:
        return `Group updated: ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.POST_APPROVED:
        return 'Post approved';
      case WORKER_CONFIG.NOTIFICATION_TYPES.POST_REMOVED:
        return 'Post removed';
      case WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST:
        return `New join request`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.LEAVE_REQUEST:
        return 'Member left group';
      case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT:
        return 'New report';
      case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT_ACTION:
        return 'Report action taken';
      default:
        return 'New activity';
    }
  }

  getBody(type, data) {
    const groupName = data.groupName || 'a group';
    const authorName = data.authorName || 'someone';

    switch (type) {
      case WORKER_CONFIG.NOTIFICATION_TYPES.TAG_POST:
        return `${authorName} mentioned you in ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.TAG_REPLY:
        return `${authorName} tagged you in a reply in ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.REACTION:
        return `${authorName} reacted to your post in ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.GROUP_UPDATE:
        return `${groupName} has been updated`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.POST_APPROVED:
        return `Your post in ${groupName} has been approved`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.POST_REMOVED:
        return `Your post in ${groupName} has been removed`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST:
        return `${authorName} wants to join ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.LEAVE_REQUEST:
        return `${authorName} has left ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT:
        return `New ${data.reportType || 'content'} report in ${groupName}`;
      case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT_ACTION:
        return `Action taken on ${data.reportType || 'a'} report in ${groupName}`;
      default:
        return `New activity in ${groupName}`;
    }
  }

  getNotificationUrl(type, data) {
    let url = '/notifications';
    
    if (data.groupId) {
      url = `/group/${data.groupId}`;
      
      if (data.eventId) {
        url += `?post=${data.eventId}`;
      }
      
      switch (type) {
        case WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST:
          url += '#members?membersTab=requests';
          break;
        case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT:
        case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT_ACTION:
          url += `#reports${data.eventId ? `?reportId=${data.eventId}` : ''}`;
          break;
      }
    }
    
    return url;
  }

  requiresInteraction(type) {
    return [
      WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST,
      WORKER_CONFIG.NOTIFICATION_TYPES.REPORT
    ].includes(type);
  }

  getActions(type, data) {
    const actions = [];

    switch (type) {
      case WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST:
        actions.push(
          { action: 'approve', title: 'Approve' },
          { action: 'deny', title: 'Deny' }
        );
        break;
      case WORKER_CONFIG.NOTIFICATION_TYPES.REPORT:
        actions.push(
          { action: 'review', title: 'Review' },
          { action: 'dismiss', title: 'Dismiss' }
        );
        break;
      case WORKER_CONFIG.NOTIFICATION_TYPES.TAG_POST:
      case WORKER_CONFIG.NOTIFICATION_TYPES.TAG_REPLY:
        actions.push(
          { action: 'reply', title: 'Reply' },
          { action: 'view', title: 'View' }
        );
        break;
    }

    return actions;
  }

  getNotifications() {
    return this.notifications;
  }

  clear() {
    this.notifications = [];
  }
}

// Enhanced Nostr client for batch operations
class NostrClient {
  constructor(relays) {
    this.relays = relays;
    this.connections = new Map();
  }

  async connect() {
    for (const relay of this.relays) {
      try {
        const ws = new WebSocket(relay);
        await new Promise((resolve, reject) => {
          ws.onopen = () => {
            this.connections.set(relay, ws);
            resolve();
          };
          ws.onerror = () => reject(new Error(`Failed to connect to ${relay}`));
          setTimeout(() => reject(new Error(`Timeout connecting to ${relay}`)), 5000);
        });
      } catch (error) {
        console.error(`Failed to connect to relay ${relay}:`, error);
      }
    }
  }

  async query(filters, options = {}) {
    if (this.connections.size === 0) {
      await this.connect();
    }

    const events = [];
    const promises = [];

    for (const [relay, ws] of this.connections) {
      if (ws.readyState !== WebSocket.OPEN) continue;

      const promise = new Promise((resolve) => {
        const subscriptionId = Math.random().toString(36).substr(2, 9);
        const timeout = setTimeout(() => {
          ws.send(JSON.stringify(['CLOSE', subscriptionId]));
          resolve([]);
        }, options.timeout || 10000);

        const handler = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message[0] === 'EVENT' && message[1] === subscriptionId) {
              events.push(message[2]);
            } else if (message[0] === 'EOSE' && message[1] === subscriptionId) {
              clearTimeout(timeout);
              ws.removeEventListener('message', handler);
              ws.send(JSON.stringify(['CLOSE', subscriptionId]));
              resolve(events);
            }
          } catch (e) {
            console.error('Error parsing relay message:', e);
          }
        };

        ws.addEventListener('message', handler);
        ws.send(JSON.stringify(['REQ', subscriptionId, ...filters]));
      });

      promises.push(promise);
    }

    await Promise.allSettled(promises);
    
    // Deduplicate events by ID
    const uniqueEvents = events.reduce((acc, event) => {
      acc[event.id] = event;
      return acc;
    }, {});

    return Object.values(uniqueEvents);
  }

  async getProfile(pubkey) {
    const events = await this.query([{
      kinds: [WORKER_CONFIG.NOSTR_KINDS.METADATA],
      authors: [pubkey],
      limit: 1
    }]);

    if (events.length === 0) return null;

    try {
      return JSON.parse(events[0].content);
    } catch (e) {
      return null;
    }
  }

  async getUserGroups(pubkey) {
    // Get groups the user is a member of
    const memberEvents = await this.query([{
      kinds: [WORKER_CONFIG.NOSTR_KINDS.JOIN_REQUEST],
      authors: [pubkey],
      limit: 50
    }]);

    // Get groups the user owns or moderates
    const ownedGroups = await this.query([{
      kinds: [WORKER_CONFIG.NOSTR_KINDS.COMMUNITY],
      authors: [pubkey],
      limit: 50
    }]);

    return {
      memberOf: memberEvents.map(e => e.tags.find(t => t[0] === 'a')?.[1]).filter(Boolean),
      owned: ownedGroups.map(e => this.getCommunityId(e)),
      moderated: [] // Would need to query moderator events
    };
  }

  getCommunityId(event) {
    const dTag = event.tags.find(tag => tag[0] === 'd')?.[1] || '';
    return `34550:${event.pubkey}:${dTag}`;
  }

  disconnect() {
    for (const [relay, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.connections.clear();
  }
}

// Main worker class
class NotificationWorker {
  constructor(env) {
    this.env = env;
    this.kv = env.NOTIFICATION_KV;
    this.relays = (env.NOSTR_RELAYS || 'wss://relay.chorus.community/').split(',');
    this.nostr = new NostrClient(this.relays);
    this.notificationBuilder = new NotificationBuilder();
  }

  async processNotifications() {
    console.log('Starting notification processing...');

    try {
      // Get all registered users
      const users = await this.getAllUsers();
      console.log(`Found ${users.length} registered users`);

      if (users.length === 0) return;

      // Get the last poll timestamp
      const lastPoll = await this.kv.get('last_poll_timestamp');
      const since = lastPoll ? parseInt(lastPoll) : Math.floor(Date.now() / 1000) - 3600; // Last hour if no timestamp

      // Process each type of notification
      await this.processTagNotifications(users, since);
      await this.processReactionNotifications(users, since);
      await this.processGroupUpdateNotifications(users, since);
      await this.processPostModerationNotifications(users, since);
      await this.processMembershipNotifications(users, since);
      await this.processReportNotifications(users, since);

      // Send all queued notifications
      await this.sendQueuedNotifications();

      // Update last poll timestamp
      await this.kv.put('last_poll_timestamp', Math.floor(Date.now() / 1000).toString());

      console.log('Notification processing completed successfully');

    } catch (error) {
      console.error('Error in notification processing:', error);
      throw error;
    } finally {
      this.nostr.disconnect();
    }
  }

  async getAllUsers() {
    try {
      const key = 'users:all';
      const usersData = await this.kv.get(key);
      
      if (!usersData) return [];
      
      const userData = JSON.parse(usersData);
      return userData.map(data => new UserProfile(data));
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  }

  async processTagNotifications(users, since) {
    console.log('Processing tag notifications...');

    // Get all tag events since last poll
    const tagEvents = await this.nostr.query([
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.TAG_POST], since },
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.TAG_REPLY], since }
    ]);

    for (const event of tagEvents) {
      // Find tagged users
      const taggedPubkeys = event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]);

      for (const pubkey of taggedPubkeys) {
        const user = users.find(u => u.pubkey === pubkey);
        if (!user) continue;

        // Don't notify users of their own posts
        if (user.pubkey === event.pubkey) continue;

        const notificationType = event.kind === WORKER_CONFIG.NOSTR_KINDS.TAG_POST 
          ? WORKER_CONFIG.NOTIFICATION_TYPES.TAG_POST
          : WORKER_CONFIG.NOTIFICATION_TYPES.TAG_REPLY;

        if (!user.shouldReceiveNotification('mentions', event.created_at * 1000)) continue;

        // Get group info
        const groupId = event.tags.find(tag => tag[0] === 'a')?.[1];
        const groupInfo = groupId ? await this.getGroupInfo(groupId) : null;

        // Get author info
        const authorInfo = await this.getAuthorInfo(event.pubkey);

        this.notificationBuilder.addNotification(user.pubkey, notificationType, {
          eventId: event.id,
          groupId,
          pubkey: event.pubkey,
          groupName: groupInfo?.name,
          authorName: authorInfo?.name
        });
      }
    }
  }

  async processReactionNotifications(users, since) {
    console.log('Processing reaction notifications...');

    const reactionEvents = await this.nostr.query([{
      kinds: [WORKER_CONFIG.NOSTR_KINDS.REACTION],
      since
    }]);

    for (const event of reactionEvents) {
      // Get the target event
      const targetEventId = event.tags.find(tag => tag[0] === 'e')?.[1];
      if (!targetEventId) continue;

      // Get target pubkey
      const targetPubkey = event.tags.find(tag => tag[0] === 'p')?.[1];
      if (!targetPubkey) continue;

      const user = users.find(u => u.pubkey === targetPubkey);
      if (!user) continue;

      // Don't notify users of their own reactions
      if (user.pubkey === event.pubkey) continue;

      if (!user.shouldReceiveNotification('reactions', event.created_at * 1000)) continue;

      const groupId = event.tags.find(tag => tag[0] === 'a')?.[1];
      const groupInfo = groupId ? await this.getGroupInfo(groupId) : null;
      const authorInfo = await this.getAuthorInfo(event.pubkey);

      this.notificationBuilder.addNotification(user.pubkey, WORKER_CONFIG.NOTIFICATION_TYPES.REACTION, {
        eventId: targetEventId,
        groupId,
        pubkey: event.pubkey,
        groupName: groupInfo?.name,
        authorName: authorInfo?.name
      });
    }
  }

  async processGroupUpdateNotifications(users, since) {
    console.log('Processing group update notifications...');

    const groupUpdateEvents = await this.nostr.query([{
      kinds: [WORKER_CONFIG.NOSTR_KINDS.COMMUNITY],
      since
    }]);

    for (const event of groupUpdateEvents) {
      const groupId = this.nostr.getCommunityId(event);
      const groupName = event.tags.find(tag => tag[0] === 'name')?.[1] || 'Unknown Group';

      // Notify all group members
      for (const user of users) {
        if (!user.isMemberOf(groupId)) continue;
        if (!user.shouldReceiveNotification('groupUpdates', event.created_at * 1000)) continue;

        this.notificationBuilder.addNotification(user.pubkey, WORKER_CONFIG.NOTIFICATION_TYPES.GROUP_UPDATE, {
          eventId: event.id,
          groupId,
          groupName
        });
      }
    }
  }

  async processPostModerationNotifications(users, since) {
    console.log('Processing post moderation notifications...');

    const moderationEvents = await this.nostr.query([
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.POST_APPROVAL], since },
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.POST_REQUEST], since }
    ]);

    for (const event of moderationEvents) {
      const targetPubkey = event.tags.find(tag => tag[0] === 'p')?.[1];
      if (!targetPubkey) continue;

      const user = users.find(u => u.pubkey === targetPubkey);
      if (!user) continue;

      if (!user.shouldReceiveNotification('postApprovals', event.created_at * 1000)) continue;

      const notificationType = event.kind === WORKER_CONFIG.NOSTR_KINDS.POST_APPROVAL
        ? WORKER_CONFIG.NOTIFICATION_TYPES.POST_APPROVED
        : WORKER_CONFIG.NOTIFICATION_TYPES.POST_REMOVED;

      const groupId = event.tags.find(tag => tag[0] === 'a')?.[1];
      const groupInfo = groupId ? await this.getGroupInfo(groupId) : null;

      this.notificationBuilder.addNotification(user.pubkey, notificationType, {
        eventId: event.tags.find(tag => tag[0] === 'e')?.[1],
        groupId,
        pubkey: event.pubkey,
        groupName: groupInfo?.name
      });
    }
  }

  async processMembershipNotifications(users, since) {
    console.log('Processing membership notifications...');

    const membershipEvents = await this.nostr.query([
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.JOIN_REQUEST], since },
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.LEAVE_REQUEST], since }
    ]);

    for (const event of membershipEvents) {
      const groupId = event.tags.find(tag => tag[0] === 'a')?.[1];
      if (!groupId) continue;

      const isJoinRequest = event.kind === WORKER_CONFIG.NOSTR_KINDS.JOIN_REQUEST;

      // Notify group moderators and admins
      for (const user of users) {
        if (!user.isModeratorOf(groupId)) continue;
        if (!user.shouldReceiveNotification('joinRequests', event.created_at * 1000)) continue;

        const notificationType = isJoinRequest 
          ? WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST
          : WORKER_CONFIG.NOTIFICATION_TYPES.LEAVE_REQUEST;

        const groupInfo = await this.getGroupInfo(groupId);
        const authorInfo = await this.getAuthorInfo(event.pubkey);

        this.notificationBuilder.addNotification(user.pubkey, notificationType, {
          eventId: event.id,
          groupId,
          pubkey: event.pubkey,
          groupName: groupInfo?.name,
          authorName: authorInfo?.name
        });
      }
    }
  }

  async processReportNotifications(users, since) {
    console.log('Processing report notifications...');

    const reportEvents = await this.nostr.query([
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.REPORT], since },
      { kinds: [WORKER_CONFIG.NOSTR_KINDS.REPORT_ACTION], since }
    ]);

    for (const event of reportEvents) {
      const groupId = event.tags.find(tag => tag[0] === 'a')?.[1];
      if (!groupId) continue;

      const isReport = event.kind === WORKER_CONFIG.NOSTR_KINDS.REPORT;

      // Notify group moderators and admins
      for (const user of users) {
        if (!user.isModeratorOf(groupId)) continue;

        // For report actions, don't notify the user who took the action
        if (!isReport && user.pubkey === event.pubkey) continue;

        if (!user.shouldReceiveNotification('reports', event.created_at * 1000)) continue;

        const notificationType = isReport 
          ? WORKER_CONFIG.NOTIFICATION_TYPES.REPORT
          : WORKER_CONFIG.NOTIFICATION_TYPES.REPORT_ACTION;

        // Get report type
        const reportType = isReport 
          ? (event.tags.find(tag => tag[0] === 'p' && tag[2])?.[2] || 'content')
          : (event.tags.find(tag => tag[0] === 't')?.[1] || 'action');

        const groupInfo = await this.getGroupInfo(groupId);
        const authorInfo = await this.getAuthorInfo(event.pubkey);

        this.notificationBuilder.addNotification(user.pubkey, notificationType, {
          eventId: event.id,
          groupId,
          pubkey: event.pubkey,
          groupName: groupInfo?.name,
          authorName: authorInfo?.name,
          reportType
        });
      }
    }
  }

  async getGroupInfo(groupId) {
    try {
      const cached = await this.kv.get(`group:${groupId}`);
      if (cached) {
        const data = JSON.parse(cached);
        // Cache for 1 hour
        if (Date.now() - data.cached < 3600000) {
          return data.info;
        }
      }

      // Parse group ID
      const parts = groupId.split(':');
      if (parts.length !== 3) return null;

      const [kind, pubkey, identifier] = parts;

      const events = await this.nostr.query([{
        kinds: [parseInt(kind)],
        authors: [pubkey],
        '#d': [identifier],
        limit: 1
      }]);

      if (events.length === 0) return null;

      const event = events[0];
      const info = {
        name: event.tags.find(tag => tag[0] === 'name')?.[1] || 'Unknown Group',
        description: event.tags.find(tag => tag[0] === 'about')?.[1] || '',
        image: event.tags.find(tag => tag[0] === 'image')?.[1] || ''
      };

      // Cache the result
      await this.kv.put(`group:${groupId}`, JSON.stringify({
        info,
        cached: Date.now()
      }), { expirationTtl: 3600 });

      return info;
    } catch (error) {
      console.error('Error getting group info:', error);
      return null;
    }
  }

  async getAuthorInfo(pubkey) {
    try {
      const cached = await this.kv.get(`author:${pubkey}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.cached < 3600000) {
          return data.info;
        }
      }

      const profile = await this.nostr.getProfile(pubkey);
      const info = {
        name: profile?.name || profile?.display_name || pubkey.slice(0, 8),
        picture: profile?.picture || ''
      };

      await this.kv.put(`author:${pubkey}`, JSON.stringify({
        info,
        cached: Date.now()
      }), { expirationTtl: 3600 });

      return info;
    } catch (error) {
      console.error('Error getting author info:', error);
      return { name: pubkey.slice(0, 8), picture: '' };
    }
  }

  async sendQueuedNotifications() {
    const notifications = this.notificationBuilder.getNotifications();
    console.log(`Sending ${notifications.length} notifications...`);

    const users = await this.getAllUsers();
    const userMap = new Map(users.map(u => [u.pubkey, u]));

    for (const notification of notifications) {
      const user = userMap.get(notification.userId);
      if (!user || !user.subscription) continue;

      try {
        await this.sendPushNotification(user.subscription, notification.data);
      } catch (error) {
        console.error(`Failed to send notification to ${notification.userId}:`, error);
      }
    }

    this.notificationBuilder.clear();
  }

  async sendPushNotification(subscription, data) {
    const payload = JSON.stringify(data);
    
    // This would use the web push library
    // For now, just log what would be sent
    console.log('Would send push notification:', {
      endpoint: subscription.endpoint,
      payload: data
    });

    // Implementation would use VAPID keys and web push protocol
    // const webpush = require('web-push');
    // webpush.setVapidDetails("mailto:" + env.ADMIN_EMAIL, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    // return webpush.sendNotification(subscription, payload);
  }

  async getStats() {
    const users = await this.getAllUsers();
    const lastPoll = await this.kv.get('last_poll_timestamp');
    
    return {
      registeredUsers: users.length,
      activeSubscriptions: users.filter(u => u.subscription).length,
      lastPoll: lastPoll ? new Date(parseInt(lastPoll) * 1000) : null,
      relays: this.relays,
      uptime: 'Active'
    };
  }
}

// Worker event handlers
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const worker = new NotificationWorker(env);

    try {
      switch (url.pathname) {
        case '/health':
          return new Response(JSON.stringify({ 
            status: 'ok', 
            timestamp: new Date().toISOString() 
          }), {
            headers: { 'Content-Type': 'application/json' }
          });

        case '/stats':
          const stats = await worker.getStats();
          return new Response(JSON.stringify(stats), {
            headers: { 'Content-Type': 'application/json' }
          });

        case '/register':
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }
          
          const registrationData = await request.json();
          await worker.registerUser(registrationData);
          return new Response(JSON.stringify({ success: true }));

        case '/unregister':
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }
          
          const unregData = await request.json();
          await worker.unregisterUser(unregData.pubkey);
          return new Response(JSON.stringify({ success: true }));

        case '/test':
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }
          
          await worker.processNotifications();
          return new Response(JSON.stringify({ 
            message: 'Test run completed',
            timestamp: new Date().toISOString()
          }));

        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async scheduled(controller, env) {
    const worker = new NotificationWorker(env);
    
    try {
      await worker.processNotifications();
    } catch (error) {
      console.error('Scheduled task error:', error);
      throw error;
    }
  }
};
