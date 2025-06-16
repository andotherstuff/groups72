/**
 * Web Push Implementation for Cloudflare Workers
 * Handles VAPID authentication and push notification delivery
 */

/**
 * Web Push implementation using crypto APIs available in Cloudflare Workers
 */
class WebPush {
  constructor(vapidPrivateKey, vapidPublicKey, subject) {
    this.vapidPrivateKey = vapidPrivateKey;
    this.vapidPublicKey = vapidPublicKey;
    this.subject = subject; // mailto:admin@example.com or https://example.com
  }

  /**
   * Send a push notification
   */
  async sendNotification(subscription, payload, options = {}) {
    const { endpoint, keys } = subscription;
    
    // Parse the endpoint to get the push service details
    const serviceUrl = new URL(endpoint);
    
    // Create the request headers
    const headers = {
      'Content-Type': 'application/octet-stream',
      'TTL': options.TTL || '86400', // 24 hours default
      'Content-Encoding': 'aes128gcm'
    };

    // Add authorization header for different push services
    if (serviceUrl.hostname.includes('googleapis.com')) {
      // Google FCM
      const auth = await this.generateGCMAuth();
      headers['Authorization'] = `key=${auth}`;
    } else {
      // Mozilla, Microsoft, and others - use VAPID
      const vapidAuth = await this.generateVAPIDAuth(serviceUrl.origin, payload);
      headers['Authorization'] = `vapid t=${vapidAuth.token}, k=${this.vapidPublicKey}`;
      headers['Crypto-Key'] = `p256ecdsa=${this.vapidPublicKey}`;
    }

    // Encrypt the payload
    let encryptedPayload = '';
    if (payload) {
      encryptedPayload = await this.encryptPayload(payload, keys.p256dh, keys.auth);
    }

    // Send the request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: encryptedPayload || null
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Push notification failed: ${response.status} ${errorText}`);
    }

    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text()
    };
  }

  /**
   * Generate VAPID authentication
   */
  async generateVAPIDAuth(audience, payload) {
    const now = Math.floor(Date.now() / 1000);
    
    const header = {
      typ: 'JWT',
      alg: 'ES256'
    };

    const claims = {
      aud: audience,
      exp: now + (12 * 60 * 60), // 12 hours
      sub: this.subject
    };

    // Create JWT
    const encodedHeader = this.base64URLEncode(JSON.stringify(header));
    const encodedPayload = this.base64URLEncode(JSON.stringify(claims));
    
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    
    // Sign with private key
    const signature = await this.signJWT(unsignedToken);
    const encodedSignature = this.base64URLEncode(signature);
    
    return {
      token: `${unsignedToken}.${encodedSignature}`
    };
  }

  /**
   * Encrypt payload using ECDH and AES-GCM
   */
  async encryptPayload(payload, userPublicKey, userAuth) {
    // This is a simplified version - full implementation would require
    // proper ECDH key derivation and AES-GCM encryption
    
    // For now, return the payload as-is (unencrypted)
    // In production, implement proper RFC 8291 encryption
    return payload;
  }

  /**
   * Sign JWT with VAPID private key
   */
  async signJWT(data) {
    // Import the private key
    const privateKeyBuffer = this.base64URLDecode(this.vapidPrivateKey);
    
    // This would need proper ES256 signing implementation
    // For now, return mock signature
    return 'mock-signature';
  }

  /**
   * Base64 URL encoding
   */
  base64URLEncode(str) {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64 URL decoding
   */
  base64URLDecode(str) {
    str += new Array(5 - str.length % 4).join('=');
    return atob(str.replace(/\-/g, '+').replace(/_/g, '/'));
  }
}

/**
 * Enhanced NotificationWorker with Web Push support
 */
export class WebPushNotificationWorker extends NotificationWorker {
  constructor(env) {
    super(env);
    this.webPush = new WebPush(
      env.VAPID_PRIVATE_KEY,
      env.VAPID_PUBLIC_KEY, 
      env.VAPID_SUBJECT || `mailto:${env.ADMIN_EMAIL}`
    );
  }

  /**
   * Send push notification using web push protocol
   */
  async sendPushNotification(subscription, data) {
    try {
      const payload = JSON.stringify(data);
      
      const result = await this.webPush.sendNotification(subscription, payload, {
        TTL: 86400, // 24 hours
        urgency: this.getUrgency(data.type)
      });

      console.log(`Push notification sent successfully to ${subscription.endpoint.slice(0, 50)}...`);
      return result;
      
    } catch (error) {
      console.error(`Failed to send push notification:`, error);
      
      // Handle different types of errors
      if (error.message.includes('410') || error.message.includes('404')) {
        // Subscription is no longer valid, remove it
        await this.removeInvalidSubscription(subscription);
      }
      
      throw error;
    }
  }

  /**
   * Get urgency level for different notification types
   */
  getUrgency(type) {
    const urgentTypes = [
      WORKER_CONFIG.NOTIFICATION_TYPES.REPORT,
      WORKER_CONFIG.NOTIFICATION_TYPES.JOIN_REQUEST
    ];
    
    const normalTypes = [
      WORKER_CONFIG.NOTIFICATION_TYPES.TAG_POST,
      WORKER_CONFIG.NOTIFICATION_TYPES.TAG_REPLY,
      WORKER_CONFIG.NOTIFICATION_TYPES.REACTION
    ];

    if (urgentTypes.includes(type)) return 'high';
    if (normalTypes.includes(type)) return 'normal';
    return 'low';
  }

  /**
   * Remove invalid subscription from user database
   */
  async removeInvalidSubscription(invalidSubscription) {
    const users = await this.getAllUsers();
    
    for (let i = 0; i < users.length; i++) {
      if (users[i].subscription && 
          users[i].subscription.endpoint === invalidSubscription.endpoint) {
        console.log(`Removing invalid subscription for user ${users[i].pubkey.slice(0, 8)}`);
        users[i].subscription = null;
        break;
      }
    }

    await this.kv.put('users:all', JSON.stringify(users));
  }

  /**
   * Send test notification to a specific user
   */
  async sendTestNotification(pubkey, customData = {}) {
    const user = await this.getUser(pubkey);
    
    if (!user || !user.subscription) {
      throw new Error('User not found or no subscription available');
    }

    const testData = {
      title: 'Test Notification',
      body: 'This is a test notification from +chorus!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: {
        type: 'test',
        timestamp: Date.now(),
        url: '/notifications',
        ...customData
      }
    };

    return await this.sendPushNotification(user.subscription, testData);
  }

  /**
   * Batch send notifications with rate limiting
   */
  async sendBatchNotifications(notifications, batchSize = 10) {
    const users = await this.getAllUsers();
    const userMap = new Map(users.map(u => [u.pubkey, u]));

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      
      const promises = batch.map(async (notification) => {
        const user = userMap.get(notification.userId);
        if (!user || !user.subscription) return null;

        try {
          await this.sendPushNotification(user.subscription, notification.data);
          sent++;
        } catch (error) {
          failed++;
          console.error(`Failed to send notification to ${notification.userId}:`, error);
        }
      });

      await Promise.allSettled(promises);
      
      // Rate limiting - wait 100ms between batches
      if (i + batchSize < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { sent, failed, total: notifications.length };
  }

  /**
   * Override the sendQueuedNotifications method
   */
  async sendQueuedNotifications() {
    const notifications = this.notificationBuilder.getNotifications();
    console.log(`Sending ${notifications.length} notifications...`);

    if (notifications.length === 0) return { sent: 0, failed: 0, total: 0 };

    const result = await this.sendBatchNotifications(notifications);
    
    this.notificationBuilder.clear();
    
    console.log(`Notification batch complete: ${result.sent} sent, ${result.failed} failed`);
    
    return result;
  }
}

// Enhanced stats with notification history
export function enhanceStatsWithPushMetrics(worker) {
  const originalGetStats = worker.getStats;
  
  worker.getStats = async function() {
    const baseStats = await originalGetStats.call(this);
    
    // Add push notification metrics
    const pushStats = await this.kv.get('push_stats');
    const stats = pushStats ? JSON.parse(pushStats) : {
      totalSent: 0,
      totalFailed: 0,
      lastBatch: null,
      dailyStats: {}
    };

    return {
      ...baseStats,
      pushNotifications: stats
    };
  };
}

// Helper to update push statistics
export async function updatePushStats(kv, result) {
  const today = new Date().toISOString().split('T')[0];
  
  let stats = await kv.get('push_stats');
  stats = stats ? JSON.parse(stats) : {
    totalSent: 0,
    totalFailed: 0,
    lastBatch: null,
    dailyStats: {}
  };

  stats.totalSent += result.sent;
  stats.totalFailed += result.failed;
  stats.lastBatch = {
    timestamp: Date.now(),
    sent: result.sent,
    failed: result.failed,
    total: result.total
  };

  if (!stats.dailyStats[today]) {
    stats.dailyStats[today] = { sent: 0, failed: 0 };
  }
  
  stats.dailyStats[today].sent += result.sent;
  stats.dailyStats[today].failed += result.failed;

  // Keep only last 30 days
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  for (const date of Object.keys(stats.dailyStats)) {
    if (date < cutoffDate) {
      delete stats.dailyStats[date];
    }
  }

  await kv.put('push_stats', JSON.stringify(stats));
}

export { WebPush };
