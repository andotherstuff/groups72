import { env, pushService, webPush, metrics, logger } from '../src/dev-server';

async function runIntegrationTests() {
  console.log('Starting integration tests...');

  // Test data
  const testNpub = 'npub1test123456789abcdefghijklmnopqrstuvwxyz';
  const testSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
    keys: {
      p256dh: 'test-p256dh',
      auth: 'test-auth'
    }
  };

  try {
    // 1. Register push subscription
    console.log('Testing subscription registration...');
    const registerResult = await pushService.registerSubscription(testNpub, testSubscription);
    console.log('Registration result:', registerResult);

    // 2. Verify subscription is stored
    console.log('Verifying stored subscription...');
    const storedSubscription = await pushService.getSubscription(testNpub);
    console.log('Stored subscription:', storedSubscription);

    // 3. Send a test notification
    console.log('Sending test notification...');
    const testPayload = {
      title: 'Test Notification',
      body: 'This is a test notification',
      data: {
        url: '/test',
        type: 'test',
        priority: 'high' as const
      }
    };

    const sendResult = await pushService.sendNotification(testSubscription, testPayload);
    console.log('Send result:', sendResult);

    // 4. Check metrics
    console.log('Checking metrics...');
    const currentMetrics = await metrics.getMetrics();
    console.log('Current metrics:', currentMetrics);

    // 5. Check logs
    console.log('Checking logs...');
    const logs = await logger.getLogs();
    console.log('Recent logs:', logs);

    // 6. Test queue processing
    console.log('Testing queue processing...');
    const queueId = await pushService.queueNotification(testSubscription, testPayload);
    console.log('Queued notification with ID:', queueId);

    const processResult = await pushService.processQueue();
    console.log('Queue processing result:', processResult);

    console.log('Integration tests completed successfully!');
  } catch (error) {
    console.error('Integration test failed:', error);
    process.exit(1);
  }
}

// Run the tests
runIntegrationTests(); 