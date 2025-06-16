import { WebPush } from './web-push';

type KVNamespace = {
  get: <T>(key: string, type?: 'text' | 'json') => Promise<T | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

type DurableObjectState = {
  waitUntil: (promise: Promise<unknown>) => void;
};

interface Env {
  KV: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  FCM_SERVER_KEY?: string;
}

interface QueueItem {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  payload: {
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
  };
  attempts: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

export class PushQueue {
  private state: DurableObjectState;
  private env: Env;
  private processing = false;
  private maxRetries = 3;
  private retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/process':
        return this.handleProcess(request);
      case '/status':
        return this.handleStatus(request);
      case '/retry':
        return this.handleRetry(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleProcess(request: Request): Promise<Response> {
    if (this.processing) {
      return new Response('Already processing', { status: 409 });
    }

    try {
      this.processing = true;
      const { queueId } = await request.json();
      
      const queueItem = await this.env.KV.get<QueueItem>(`push-queue:${queueId}`, 'json');
      if (!queueItem) {
        return new Response('Queue item not found', { status: 404 });
      }

      const result = await this.processQueueItem(queueItem, queueId);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Queue processing error:', error);
      return new Response('Internal server error', { status: 500 });
    } finally {
      this.processing = false;
    }
  }

  private async handleStatus(request: Request): Promise<Response> {
    const { queueId } = await request.json();
    const queueItem = await this.env.KV.get<QueueItem>(`push-queue:${queueId}`, 'json');
    
    if (!queueItem) {
      return new Response('Queue item not found', { status: 404 });
    }

    return new Response(JSON.stringify({
      status: this.getQueueItemStatus(queueItem),
      attempts: queueItem.attempts,
      lastAttempt: queueItem.lastAttempt,
      error: queueItem.error
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleRetry(request: Request): Promise<Response> {
    const { queueId } = await request.json();
    const queueItem = await this.env.KV.get<QueueItem>(`push-queue:${queueId}`, 'json');
    
    if (!queueItem) {
      return new Response('Queue item not found', { status: 404 });
    }

    if (queueItem.attempts >= this.maxRetries) {
      return new Response('Max retries exceeded', { status: 400 });
    }

    // Reset error and increment attempts
    queueItem.error = undefined;
    queueItem.attempts++;
    queueItem.lastAttempt = Date.now();

    await this.env.KV.put(`push-queue:${queueId}`, JSON.stringify(queueItem));

    // Schedule retry
    const delay = this.retryDelays[queueItem.attempts - 1] || this.retryDelays[this.retryDelays.length - 1];
    await this.state.waitUntil(
      new Promise(resolve => setTimeout(resolve, delay))
        .then(() => this.processQueueItem(queueItem, queueId))
    );

    return new Response(JSON.stringify({ status: 'retry_scheduled' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async processQueueItem(queueItem: QueueItem, queueId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const webPush = new WebPush(
        this.env.VAPID_PRIVATE_KEY,
        this.env.VAPID_PUBLIC_KEY,
        'mailto:admin@chorus.social'
      );

      const result = await webPush.sendNotification(
        queueItem.subscription,
        JSON.stringify(queueItem.payload),
        {
          TTL: '86400',
          urgency: queueItem.payload.data?.priority === 'high' ? 'high' : 'normal'
        }
      );

      if (result.statusCode >= 200 && result.statusCode < 300) {
        // Success - remove from queue
        await this.env.KV.delete(`push-queue:${queueId}`);
        return { success: true };
      }

      // Handle specific error cases
      if (result.statusCode === 410 || result.statusCode === 404) {
        // Subscription is no longer valid
        await this.removeInvalidSubscription(queueItem.subscription);
        await this.env.KV.delete(`push-queue:${queueId}`);
        return { success: false, error: 'subscription_invalid' };
      }

      // Update queue item with error
      queueItem.error = `HTTP ${result.statusCode}: ${result.body}`;
      queueItem.lastAttempt = Date.now();
      await this.env.KV.put(`push-queue:${queueId}`, JSON.stringify(queueItem));

      return { success: false, error: queueItem.error };
    } catch (error) {
      // Update queue item with error
      queueItem.error = error instanceof Error ? error.message : 'Unknown error';
      queueItem.lastAttempt = Date.now();
      await this.env.KV.put(`push-queue:${queueId}`, JSON.stringify(queueItem));

      return { success: false, error: queueItem.error };
    }
  }

  private getQueueItemStatus(queueItem: QueueItem): string {
    if (queueItem.attempts >= this.maxRetries) {
      return 'failed';
    }
    if (queueItem.error) {
      return 'error';
    }
    if (queueItem.lastAttempt) {
      return 'processing';
    }
    return 'pending';
  }

  private async removeInvalidSubscription(subscription: { endpoint: string }): Promise<void> {
    const users = await this.env.KV.list({ prefix: 'sub:' });
    
    for (const key of users.keys) {
      const user = await this.env.KV.get(key.name, 'json');
      if (user?.subscription?.endpoint === subscription.endpoint) {
        await this.env.KV.delete(key.name);
        break;
      }
    }
  }
} 