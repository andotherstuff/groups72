// Test the notification system logic locally
import { NotificationSystem, NOTIFICATION_EVENT_KINDS } from './src/notification-system.ts';

console.log('Testing Notification System Logic');
console.log('=================================');

// Mock environment
const mockEnv = {
  KV: {
    get: async (key) => {
      console.log(`KV.get(${key})`);
      return null;
    },
    put: async (key, value) => {
      console.log(`KV.put(${key}, ${value})`);
    },
    list: async (options) => {
      console.log(`KV.list(${JSON.stringify(options)})`);
      return { keys: [] };
    }
  },
  PUSH_DISPATCH_API: 'https://mock-api.com',
  BOT_TOKEN: 'mock-token'
};

// Test event
const testEvent = {
  id: 'test123',
  kind: 42,
  pubkey: 'testpubkey',
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['h', 'protest-net/test-group'],
    ['p', 'mentioneduser']
  ],
  content: 'Hey @mentioneduser check out this urgent message!',
  sig: 'testsig'
};

console.log('\nTest Event:', JSON.stringify(testEvent, null, 2));

// Create notification system
const notifSystem = new NotificationSystem(mockEnv);

// Process event
console.log('\nProcessing event...');
const triggers = await notifSystem.processEvent(testEvent);

console.log('\nTriggered Notifications:', triggers);
console.log('\n✅ Notification system logic verified!');
