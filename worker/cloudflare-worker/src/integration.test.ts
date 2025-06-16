import '@jest/globals';
import { PushService } from './push-service';
import { PushMetrics } from './push-metrics';
import { PushLogger } from './push-logger';
import { WebPush } from './web-push';

// Mock environment
const mockEnv = {
  KV: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    list: jest.fn()
  },
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  PUSH_QUEUE: {
    idFromName: jest.fn().mockReturnValue('test-id'),
    get: jest.fn().mockReturnValue({
      fetch: jest.fn()
    })
  }
};

describe('Push Notification Integration', () => {
  let pushService: PushService;
  let metrics: PushMetrics;
  let logger: PushLogger;
  let webPush: WebPush;

  // Test data
  const testNpub = 'npub1test123456789abcdefghijklmnopqrstuvwxyz';
  const testSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
    keys: {
      p256dh: 'test-p256dh',
      auth: 'test-auth'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pushService = new PushService(mockEnv);
    metrics = new PushMetrics(mockEnv);
    logger = new PushLogger(mockEnv);
    webPush = new WebPush(mockEnv);
  });

  describe('Full Push Notification Flow', () => {
    it('should register subscription and send notification', async () => {
      // 1. Register push subscription
      mockEnv.KV.get.mockResolvedValueOnce(null); // No existing subscription
      mockEnv.KV.put.mockResolvedValueOnce(undefined);

      const registerResult = await pushService.registerSubscription(testNpub, testSubscription);
      expect(registerResult).toBe(true);
      expect(mockEnv.KV.put).toHaveBeenCalledWith(
        `push:${testNpub}`,
        JSON.stringify(testSubscription)
      );

      // 2. Verify subscription is stored
      mockEnv.KV.get.mockResolvedValueOnce(JSON.stringify(testSubscription));
      const storedSubscription = await pushService.getSubscription(testNpub);
      expect(storedSubscription).toEqual(testSubscription);

      // 3. Send a test notification
      const testPayload = {
        title: 'Test Notification',
        body: 'This is a test notification',
        data: {
          url: '/test',
          type: 'test',
          priority: 'high' as const
        }
      };

      mockEnv.PUSH_QUEUE.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      );

      const sendResult = await pushService.sendNotification(testSubscription, testPayload);
      expect(sendResult).toBe(true);

      // 4. Verify metrics were recorded
      const currentMetrics = await metrics.getMetrics();
      expect(currentMetrics.successfulDeliveries).toBe(1);

      // 5. Verify logs were created
      const logs = await logger.getLogs();
      expect(logs.some(log => 
        log.message.includes('Notification sent') && 
        log.data?.subscription?.endpoint === testSubscription.endpoint
      )).toBe(true);
    });

    it('should handle invalid subscription cleanup', async () => {
      // 1. Register subscription
      mockEnv.KV.get.mockResolvedValueOnce(null);
      mockEnv.KV.put.mockResolvedValueOnce(undefined);
      await pushService.registerSubscription(testNpub, testSubscription);

      // 2. Attempt to send notification with invalid subscription
      const testPayload = {
        title: 'Test Notification',
        body: 'This is a test notification'
      };

      mockEnv.PUSH_QUEUE.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'subscription_invalid' }), { status: 410 })
      );

      const sendResult = await pushService.sendNotification(testSubscription, testPayload);
      expect(sendResult).toBe(false);

      // 3. Verify subscription was removed
      expect(mockEnv.KV.delete).toHaveBeenCalledWith(`push:${testNpub}`);

      // 4. Verify metrics recorded the failure
      const currentMetrics = await metrics.getMetrics();
      expect(currentMetrics.failedDeliveries).toBe(1);
      expect(currentMetrics.errors['subscription_invalid']).toBe(1);
    });

    it('should handle notification queue processing', async () => {
      // 1. Register subscription
      mockEnv.KV.get.mockResolvedValueOnce(null);
      mockEnv.KV.put.mockResolvedValueOnce(undefined);
      await pushService.registerSubscription(testNpub, testSubscription);

      // 2. Queue a notification
      const testPayload = {
        title: 'Queued Notification',
        body: 'This is a queued notification'
      };

      const queueId = await pushService.queueNotification(testSubscription, testPayload);
      expect(queueId).toBeDefined();

      // 3. Process the queue
      mockEnv.KV.list.mockResolvedValueOnce({
        keys: [{ name: `push-queue:${queueId}` }]
      });
      mockEnv.KV.get.mockResolvedValueOnce({
        subscription: testSubscription,
        payload: testPayload,
        attempts: 0
      });
      mockEnv.PUSH_QUEUE.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      );

      const processResult = await pushService.processQueue();
      expect(processResult).toEqual({
        processed: 1,
        succeeded: 1,
        failed: 0
      });

      // 4. Verify metrics
      const currentMetrics = await metrics.getMetrics();
      expect(currentMetrics.successfulDeliveries).toBe(1);
    });
  });
}); 