import '@jest/globals';
import { PushService } from './push-service';
import { PushMetrics } from './push-metrics';
import { PushLogger } from './push-logger';

// Mock KV namespace
const mockKV = {
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  list: jest.fn()
};

// Mock Durable Object namespace
const mockDurableObject = {
  fetch: jest.fn()
};

const mockDurableObjectNamespace = {
  idFromName: jest.fn().mockReturnValue('test-id'),
  get: jest.fn().mockReturnValue(mockDurableObject)
};

// Mock environment
const mockEnv = {
  KV: mockKV,
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  PUSH_QUEUE: mockDurableObjectNamespace
};

describe('PushService', () => {
  let pushService: PushService;
  let metrics: PushMetrics;
  let logger: PushLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    pushService = new PushService(mockEnv);
    metrics = new PushMetrics(mockEnv);
    logger = new PushLogger(mockEnv);
  });

  describe('sendNotification', () => {
    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
      keys: {
        p256dh: 'test-p256dh',
        auth: 'test-auth'
      }
    };

    const mockPayload = {
      title: 'Test Notification',
      body: 'This is a test notification',
      data: {
        url: '/test',
        type: 'test',
        priority: 'high' as const
      }
    };

    it('should successfully send a notification', async () => {
      mockKV.get.mockResolvedValueOnce(null); // No existing subscription
      mockKV.put.mockResolvedValueOnce(undefined);
      mockDurableObject.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

      const result = await pushService.sendNotification(mockSubscription, mockPayload);
      expect(result).toBe(true);
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('should handle invalid subscription', async () => {
      mockKV.get.mockResolvedValueOnce(null);
      mockDurableObject.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'subscription_invalid' }), { status: 410 })
      );

      const result = await pushService.sendNotification(mockSubscription, mockPayload);
      expect(result).toBe(false);
      expect(mockKV.delete).toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      mockKV.get.mockResolvedValueOnce(null);
      mockDurableObject.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

      const result = await pushService.sendNotification(mockSubscription, mockPayload);
      expect(result).toBe(true);
      expect(mockDurableObject.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('queueNotification', () => {
    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
      keys: {
        p256dh: 'test-p256dh',
        auth: 'test-auth'
      }
    };

    const mockPayload = {
      title: 'Test Notification',
      body: 'This is a test notification'
    };

    it('should queue a notification', async () => {
      mockKV.put.mockResolvedValueOnce(undefined);
      mockDurableObject.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

      const queueId = await pushService.queueNotification(mockSubscription, mockPayload);
      expect(queueId).toBeDefined();
      expect(mockKV.put).toHaveBeenCalled();
      expect(mockDurableObject.fetch).toHaveBeenCalled();
    });
  });

  describe('processQueue', () => {
    it('should process queued notifications', async () => {
      const mockQueueItems = {
        keys: [
          { name: 'push-queue:test-1' },
          { name: 'push-queue:test-2' }
        ]
      };

      mockKV.list.mockResolvedValueOnce(mockQueueItems);
      mockKV.get
        .mockResolvedValueOnce({
          subscription: { endpoint: 'test-endpoint-1' },
          payload: { title: 'Test 1' },
          attempts: 0
        })
        .mockResolvedValueOnce({
          subscription: { endpoint: 'test-endpoint-2' },
          payload: { title: 'Test 2' },
          attempts: 0
        });

      mockDurableObject.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

      const result = await pushService.processQueue();
      expect(result).toEqual({
        processed: 2,
        succeeded: 2,
        failed: 0
      });
    });
  });

  describe('metrics', () => {
    it('should record successful delivery', async () => {
      await metrics.recordSuccess(100);
      const currentMetrics = await metrics.getMetrics();
      expect(currentMetrics.successfulDeliveries).toBe(1);
      expect(currentMetrics.averageDeliveryTime).toBe(100);
    });

    it('should record failed delivery', async () => {
      await metrics.recordFailure('test error');
      const currentMetrics = await metrics.getMetrics();
      expect(currentMetrics.failedDeliveries).toBe(1);
      expect(currentMetrics.errors['test error']).toBe(1);
    });

    it('should calculate success rate', async () => {
      await metrics.recordSuccess(100);
      await metrics.recordSuccess(200);
      await metrics.recordFailure('test error');
      const successRate = await metrics.getSuccessRate();
      expect(successRate).toBe(66.67);
    });
  });

  describe('logging', () => {
    it('should log messages', async () => {
      await logger.info('Test message', { data: 'test' });
      const logs = await logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].data).toEqual({ data: 'test' });
    });

    it('should filter logs by level', async () => {
      await logger.debug('Debug message');
      await logger.info('Info message');
      await logger.warn('Warning message');
      await logger.error('Error message');

      const errorLogs = await logger.getLogs('error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].message).toBe('Error message');
    });
  });
}); 