/**
 * Web Push implementation using crypto APIs available in Cloudflare Workers
 */
interface Env {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

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
  data?: {
    url?: string;
    type?: string;
    priority?: 'high' | 'normal' | 'low';
    [key: string]: unknown;
  };
}

interface SendResult {
  success: boolean;
  error?: string;
  deliveryTime?: number;
}

export class WebPush {
  constructor(private env: Env) {}

  async send(subscription: PushSubscription, payload: PushNotificationPayload): Promise<SendResult> {
    const startTime = Date.now();

    try {
      // Prepare the notification payload
      const notificationPayload = {
        title: payload.title,
        body: payload.body,
        data: payload.data || {}
      };

      // Prepare the request
      const request = new Request(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `vapid t=${this.generateVAPIDToken(subscription)}`
        },
        body: JSON.stringify(notificationPayload)
      });

      // Send the notification
      const response = await fetch(request);

      if (response.ok) {
        return {
          success: true,
          deliveryTime: Date.now() - startTime
        };
      }

      // Handle specific error cases
      if (response.status === 410) {
        return {
          success: false,
          error: 'subscription_invalid'
        };
      }

      return {
        success: false,
        error: `HTTP error: ${response.status}`
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private generateVAPIDToken(subscription: PushSubscription): string {
    // In a real implementation, this would generate a proper VAPID token
    // For testing, we'll return a mock token
    return 'mock-vapid-token';
  }
} 