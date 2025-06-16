import { WebPush } from './web-push';
import { PushMetrics } from './push-metrics';
import { PushLogger } from './push-logger';

type KVNamespace = {
  get: <T>(key: string, type?: 'text' | 'json') => Promise<T | null>;
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

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
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

interface Env {
  KV: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  FCM_SERVER_KEY?: string;
  PUSH_QUEUE: DurableObjectNamespace;
}

export class PushService {
  private webPush: WebPush;
  private metrics: PushMetrics;
  private logger: PushLogger;
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  constructor(private env: Env) {
    this.webPush = new WebPush(
      env.VAPID_PRIVATE_KEY,
      env.VAPID_PUBLIC_KEY,
      'mailto:admin@chorus.social'
    );
    this.metrics = new PushMetrics(env);
    this.logger = new PushLogger(env);
  }

  /**
   * Register a push subscription for a Nostr pubkey
   */
  async registerSubscription(npub: string, subscription: PushSubscription): Promise<boolean> {
    try {
      await this.env.KV.put(`push:${npub}`, JSON.stringify(subscription));
      await this.logger.info('Push subscription registered', { npub, subscription });
      return true;
    } catch (error) {
      await this.logger.error('Failed to register push subscription', error as Error, { npub, subscription });
      return false;
    }
  }

  /**
   * Get the push subscription for a Nostr pubkey
   */
  async getSubscription(npub: string): Promise<PushSubscription | null> {
    try {
      const subscription = await this.env.KV.get<PushSubscription>(`push:${npub}`, 'json');
      return subscription;
    } catch (error) {
      await this.logger.error('Failed to get push subscription', error as Error, { npub });
      return null;
    }
  }

  /**
   * Send a push notification with retry logic and metrics
   */
  async sendNotification(
    subscription: PushSubscription,
    payload: PushNotificationPayload
  ): Promise<boolean> {
    const startTime = Date.now();
    let attempts = 0;
    
    while (attempts < this.maxRetries) {
      try {
        const result = await this.webPush.sendNotification(subscription, JSON.stringify(payload), {
          TTL: '86400',
          urgency: payload.data?.priority === 'high' ? 'high' : 'normal'
        });

        if (result.statusCode >= 200 && result.statusCode < 300) {
          // Record successful delivery
          await this.metrics.recordSuccess(Date.now() - startTime);
          await this.logger.info('Notification sent', { subscription, payload, result });
          return true;
        }

        // Handle specific error cases
        if (result.statusCode === 410 || result.statusCode === 404) {
          // Subscription is no longer valid
          await this.removeInvalidSubscription(subscription);
          await this.metrics.recordInvalidSubscription();
          await this.logger.info('Removed invalid subscription', { subscription });
          return false;
        }

        attempts++;
        if (attempts < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempts));
        }
      } catch (error) {
        console.error(`Push notification attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempts));
        }
      }
    }

    // Record failed delivery
    await this.metrics.recordFailure(`Failed after ${attempts} attempts`);
    await this.logger.error('Failed to send notification', new Error(`Failed after ${attempts} attempts`), { subscription, payload });
    return false;
  }

  /**
   * Queue a notification for reliable delivery
   */
  async queueNotification(
    subscription: PushSubscription,
    payload: PushNotificationPayload
  ): Promise<string> {
    const queueId = crypto.randomUUID();
    const queueItem = {
      subscription,
      payload,
      attempts: 0,
      createdAt: Date.now()
    };

    await this.env.KV.put(
      `push-queue:${queueId}`,
      JSON.stringify(queueItem),
      { expirationTtl: 86400 } // 24 hours
    );

    await this.logger.info('Notification queued', { queueId, subscription, payload });

    // Trigger the queue processor
    const queue = this.env.PUSH_QUEUE.get(this.env.PUSH_QUEUE.idFromName('processor'));
    await queue.fetch('https://internal/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueId })
    });

    return queueId;
  }

  /**
   * Process queued notifications
   */
  async processQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const stats = { processed: 0, succeeded: 0, failed: 0 };

    try {
      const { keys } = await this.env.KV.list({ prefix: 'push-queue:' });
      
      for (const { name } of keys) {
        stats.processed++;
        
        const queueItem = await this.env.KV.get<{
          subscription: PushSubscription;
          payload: PushNotificationPayload;
          attempts: number;
        }>(name, 'json');

        if (!queueItem) continue;

        const result = await this.sendNotification(queueItem.subscription, queueItem.payload);
        
        if (result) {
          stats.succeeded++;
          await this.env.KV.delete(name);
        } else {
          stats.failed++;
          // Update attempt count
          queueItem.attempts++;
          if (queueItem.attempts < 3) { // Max 3 attempts
            await this.env.KV.put(name, JSON.stringify(queueItem));
          } else {
            await this.env.KV.delete(name);
            await this.logger.warn('Max retry attempts reached', { queueId: name, attempts: queueItem.attempts });
          }
        }
      }
    } catch (error) {
      await this.logger.error('Error processing queue', error as Error);
    }

    return stats;
  }

  /**
   * Get notification delivery metrics
   */
  async getMetrics(): Promise<{
    successRate: number;
    topErrors: Array<{ error: string; count: number }>;
    totalSent: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    invalidSubscriptions: number;
    averageDeliveryTime: number;
  }> {
    const metrics = await this.metrics.getMetrics();
    const successRate = await this.metrics.getSuccessRate();
    const topErrors = await this.metrics.getTopErrors();

    return {
      successRate,
      topErrors,
      totalSent: metrics.totalSent,
      successfulDeliveries: metrics.successfulDeliveries,
      failedDeliveries: metrics.failedDeliveries,
      invalidSubscriptions: metrics.invalidSubscriptions,
      averageDeliveryTime: metrics.averageDeliveryTime
    };
  }

  /**
   * Remove an invalid subscription
   */
  private async removeInvalidSubscription(subscription: PushSubscription): Promise<void> {
    const users = await this.env.KV.list({ prefix: 'sub:' });
    
    for (const key of users.keys) {
      const user = await this.env.KV.get(key.name, 'json');
      if (user?.subscription?.endpoint === subscription.endpoint) {
        await this.env.KV.delete(key.name);
        break;
      }
    }
  }

  private async findNpubBySubscription(subscription: PushSubscription): Promise<string | null> {
    try {
      const { keys } = await this.env.KV.list({ prefix: 'push:' });
      
      for (const { name } of keys) {
        const storedSubscription = await this.env.KV.get<PushSubscription>(name, 'json');
        if (storedSubscription?.endpoint === subscription.endpoint) {
          return name.replace('push:', '');
        }
      }
      
      return null;
    } catch (error) {
      await this.logger.error('Error finding npub by subscription', error as Error, { subscription });
      return null;
    }
  }
} 