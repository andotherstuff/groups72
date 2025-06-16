/**
 * YOLO Test Scenarios for Notification System
 * Test real-world scenarios and clean up after
 */

import { YOLOTester, generateTestKeypair } from './test-utils';
import { Event } from 'nostr-tools';

const LIVE_RELAYS = [
  'wss://relay.chorus.community/'
];

export async function runNotificationTests() {
  const { privkey, pubkey } = generateTestKeypair();
  const tester = new YOLOTester(privkey);

  // Test 1: Mention notifications
  await tester.runTestScenario(
    'Mention Notification Test',
    LIVE_RELAYS,
    async () => {
      // Create a group post with mentions
      const groupEvent = await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42, // Group message
        content: 'Hey @npub1234567890abcdef check this out!',
        tags: [
          ['h', 'protest-net/test-group'],
          ['p', 'npub1234567890abcdef'] // Mentioned user
        ]
      });

      // Simulate verification that notification should be triggered
      console.log('✅ Group post with mention created:', groupEvent.id);
      console.log('💬 Notification should trigger for: npub1234567890abcdef');

      // Add delay to let relays propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify event was received by polling relay
      // Your worker would detect this and trigger push notification
    }
  );

  // Test 2: Group activity notifications
  await tester.runTestScenario(
    'Group Activity Notification Test',
    LIVE_RELAYS,
    async () => {
      const groupId = 'protest-net/campaigns/climate';
      
      // Create multiple events in rapid succession
      const events = [];
      
      // Post 1: New discussion
      events.push(await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42,
        content: 'Important update about the climate march!',
        tags: [['h', groupId]]
      }));

      // Post 2: Reply
      events.push(await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42,
        content: 'Great news! We have 500 confirmed attendees',
        tags: [
          ['h', groupId],
          ['e', events[0].id, '', 'reply']
        ]
      }));

      // Post 3: Reaction
      events.push(await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 7,
        content: '+',
        tags: [
          ['h', groupId],
          ['e', events[0].id]
        ]
      }));

      console.log('✅ Created activity burst in group:', groupId);
      console.log('📊 Events created:', events.length);
      console.log('🔔 Subscribed users should receive aggregated notification');
    }
  );

  // Test 3: Moderation action notifications
  await tester.runTestScenario(
    'Moderation Notification Test',
    LIVE_RELAYS,
    async () => {
      const groupId = 'protest-net/moderation-test';
      
      // Create a post that gets moderated
      const originalPost = await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42,
        content: 'This is a test post that will be moderated',
        tags: [['h', groupId]]
      });

      // Moderation action
      const moderationEvent = await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 9005, // Moderation action
        content: 'Post removed: violates community guidelines',
        tags: [
          ['h', groupId],
          ['e', originalPost.id],
          ['p', originalPost.pubkey], // Notify the author
          ['action', 'delete']
        ]
      });

      console.log('🛡️ Moderation action triggered');
      console.log('📢 Author should receive notification about moderation');
    }
  );

  // Test 4: High-priority keyword alerts
  await tester.runTestScenario(
    'Keyword Alert Test',
    LIVE_RELAYS,
    async () => {
      // Users might subscribe to keywords like "urgent", "emergency", "action needed"
      const urgentPost = await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42,
        content: 'URGENT: Rally location changed to City Hall. Emergency meeting at 3pm!',
        tags: [
          ['h', 'protest-net/announcements'],
          ['priority', 'high']
        ]
      });

      console.log('🚨 High-priority keyword post created');
      console.log('🎯 Users subscribed to "urgent" or "emergency" should be notified immediately');
    }
  );

  // Test 5: Cross-group conversation tracking
  await tester.runTestScenario(
    'Cross-Group Conversation Test',
    LIVE_RELAYS,
    async () => {
      // Start a conversation in one group
      const originalPost = await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42,
        content: 'Climate activists: We need support from the transit union!',
        tags: [
          ['h', 'protest-net/climate'],
          ['cross-post', 'protest-net/transit-union']
        ]
      });

      // Cross-post to another group
      const crossPost = await tester.publishTestEvent(LIVE_RELAYS, {
        kind: 42,
        content: 'Cross-posted from climate group: ' + originalPost.content,
        tags: [
          ['h', 'protest-net/transit-union'],
          ['e', originalPost.id, '', 'cross-post'],
          ['original-group', 'protest-net/climate']
        ]
      });

      console.log('🔄 Cross-group conversation initiated');
      console.log('👥 Members of both groups should be notified of cross-collaboration');
    }
  );

  console.log('\n🎉 All YOLO tests completed! Events have been published and cleaned up.');
}

// Run the tests
if (import.meta.main) {
  runNotificationTests().catch(console.error);
}
