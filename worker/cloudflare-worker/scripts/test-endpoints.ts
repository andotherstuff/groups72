import fetch from 'node-fetch';

const BASE_URL = 'https://chorus-notifications-prod.protestnet.workers.dev';
const TEST_NPUB = 'npub1test123456789abcdefghijklmnopqrstuvwxyz';

async function testEndpoints() {
  try {
    // Test health endpoint
    console.log('\nTesting /health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    console.log('Health response:', await healthResponse.json());

    // Test subscribe endpoint
    console.log('\nTesting /api/subscribe endpoint...');
    const subscribeResponse = await fetch(`${BASE_URL}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub: TEST_NPUB,
        subscription: {
          endpoint: 'https://test-endpoint.com',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth'
          }
        },
        preferences: {
          settings: {
            enabled: true,
            mentions: true,
            groupActivity: true,
            reactions: false,
            moderation: true,
            frequency: 'immediate'
          },
          subscriptions: {
            groups: ['test-group-1', 'test-group-2']
          }
        }
      })
    });
    console.log('Subscribe response:', await subscribeResponse.json());

    // Test test-notification endpoint
    console.log('\nTesting /api/test-notification endpoint...');
    const notificationResponse = await fetch(`${BASE_URL}/api/test-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub: TEST_NPUB,
        message: 'Testing production deployment'
      })
    });
    console.log('Notification response:', await notificationResponse.json());

    // Test check subscription endpoint
    console.log('\nTesting /api/subscription/check endpoint...');
    const checkResponse = await fetch(`${BASE_URL}/api/subscription/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub: TEST_NPUB,
        endpoint: 'https://test-endpoint.com'
      })
    });
    console.log('Check subscription response:', await checkResponse.json());

    // Test update preferences endpoint
    console.log('\nTesting /api/preferences endpoint...');
    const preferencesResponse = await fetch(`${BASE_URL}/api/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub: TEST_NPUB,
        preferences: {
          settings: {
            reactions: true,
            frequency: 'hourly'
          },
          subscriptions: {
            groups: ['test-group-1', 'test-group-3']
          }
        }
      })
    });
    console.log('Update preferences response:', await preferencesResponse.json());

    // Test unsubscribe endpoint
    console.log('\nTesting /api/unsubscribe endpoint...');
    const unsubscribeResponse = await fetch(`${BASE_URL}/api/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub: TEST_NPUB
      })
    });
    console.log('Unsubscribe response:', await unsubscribeResponse.json());

  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testEndpoints(); 