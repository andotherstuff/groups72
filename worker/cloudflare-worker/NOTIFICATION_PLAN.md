# YOLO Notification System Implementation Plan

## Phase 1: Enhanced Event Detection (Week 1)

### 1.1 Update Worker to Monitor Multiple Event Types
```typescript
// Update the polling function to monitor various notification triggers
const NOTIFICATION_EVENT_KINDS = {
  GROUP_POST: 42,
  REACTION: 7,
  MODERATION: 9005,
  MENTION: 42, // Check content for @mentions
  DELETE: 5
};
```

### 1.2 Implement Mention Detection
```typescript
function extractMentions(content: string, tags: string[][]): string[] {
  const mentions = new Set<string>();
  
  // Extract from content (@npub...)
  const npubPattern = /@(npub[a-z0-9]{59})/gi;
  const matches = content.matchAll(npubPattern);
  for (const match of matches) {
    mentions.add(match[1]);
  }
  
  // Extract from p tags
  tags.filter(tag => tag[0] === 'p').forEach(tag => mentions.add(tag[1]));
  
  return Array.from(mentions);
}
```

### 1.3 Priority Scoring System
```typescript
interface NotificationPriority {
  score: number;
  reason: string;
  immediate: boolean;
}

function calculatePriority(event: NostrEvent): NotificationPriority {
  let score = 0;
  const reasons = [];
  
  // Direct mention = highest priority
  if (event.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey)) {
    score += 100;
    reasons.push('direct mention');
  }
  
  // Moderation action
  if (event.kind === 9005) {
    score += 80;
    reasons.push('moderation action');
  }
  
  // Contains urgent keywords
  const urgentKeywords = ['urgent', 'emergency', 'action needed', 'important'];
  if (urgentKeywords.some(keyword => event.content.toLowerCase().includes(keyword))) {
    score += 50;
    reasons.push('urgent keyword');
  }
  
  return {
    score,
    reason: reasons.join(', '),
    immediate: score >= 80
  };
}
```

## Phase 2: Smart Notification Aggregation (Week 2)

### 2.1 Notification Queue with Batching
```typescript
class NotificationQueue {
  private queue = new Map<string, NotificationBatch>();
  
  add(userId: string, notification: Notification) {
    if (!this.queue.has(userId)) {
      this.queue.set(userId, {
        userId,
        notifications: [],
        firstAdded: Date.now()
      });
    }
    
    const batch = this.queue.get(userId)!;
    batch.notifications.push(notification);
    
    // Immediate send for high priority
    if (notification.priority === 'high') {
      this.flush(userId);
    }
  }
  
  async flush(userId?: string) {
    if (userId) {
      const batch = this.queue.get(userId);
      if (batch) {
        await this.sendBatch(batch);
        this.queue.delete(userId);
      }
    } else {
      // Flush all
      for (const batch of this.queue.values()) {
        await this.sendBatch(batch);
      }
      this.queue.clear();
    }
  }
  
  private async sendBatch(batch: NotificationBatch) {
    // Aggregate similar notifications
    const aggregated = this.aggregateNotifications(batch.notifications);
    
    // Send to push API
    await sendPushNotification({
      userId: batch.userId,
      title: this.generateTitle(aggregated),
      body: this.generateBody(aggregated),
      data: {
        events: aggregated.map(n => n.eventId),
        groupId: aggregated[0]?.groupId
      }
    });
  }
}
```

### 2.2 User Preference Storage in KV
```typescript
// Store user preferences
await env.KV.put(
  `user:${npub}`,
  JSON.stringify({
    npub,
    pushEndpoint: endpoint,
    preferences: {
      mentions: true,
      groupActivity: true,
      keywords: ['urgent', 'rally', 'meeting'],
      quietHours: { start: 22, end: 8 }, // 10pm-8am
      frequency: 'immediate' // or 'hourly', 'daily'
    },
    lastNotified: Date.now()
  }),
  { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
);
```

## Phase 3: YOLO Testing Strategy (Ongoing)

### 3.1 Live Relay Testing with Cleanup
```typescript
// Use the YOLOTester for all testing
const tester = new YOLOTester(testPrivkey);

// Test notification triggers
await tester.runTestScenario('Test Mention Detection', LIVE_RELAYS, async () => {
  const event = await tester.publishTestEvent(LIVE_RELAYS, {
    kind: 42,
    content: `Hey @${targetNpub} check this out!`,
    tags: [['h', 'test-group'], ['p', targetNpub]]
  });
  
  // Verify notification was queued
  const queued = await checkNotificationQueue(targetNpub);
  assert(queued.length > 0, 'Notification should be queued');
});
```

### 3.2 Continuous Integration Testing
- Run YOLO tests on every deployment
- Monitor cleanup success rate
- Track relay response times
- Measure notification delivery rates

## Phase 4: Production Deployment (Week 3)

### 4.1 Gradual Rollout
1. Enable for test group first
2. Monitor performance and adjust
3. Roll out to specific activist groups
4. Full deployment to all groups

### 4.2 Monitoring Dashboard
```typescript
// Track key metrics in KV
await env.KV.put('metrics:daily', JSON.stringify({
  date: new Date().toISOString().split('T')[0],
  notifications: {
    sent: 1234,
    failed: 12,
    batched: 890
  },
  events: {
    processed: 5678,
    mentions: 234,
    highPriority: 45
  },
  performance: {
    avgProcessTime: 145, // ms
    relayLatency: 89 // ms
  }
}));
```

## Phase 5: Advanced Features (Week 4+)

### 5.1 Machine Learning Integration
- Train model on user engagement data
- Predict which notifications users will interact with
- Adjust priority scores based on ML predictions

### 5.2 Smart Quiet Hours
- Detect user timezone from activity patterns
- Respect local quiet hours automatically
- Queue non-urgent notifications for morning delivery

### 5.3 Rich Notifications
- Include event preview in notification
- Add action buttons (Reply, Like, Moderate)
- Deep link to specific group/thread

## Implementation Checklist

- [ ] Update worker.ts with new event monitoring
- [ ] Implement mention detection
- [ ] Add priority scoring
- [ ] Create notification queue with batching
- [ ] Set up user preference storage
- [ ] Implement YOLO testing framework
- [ ] Add monitoring and metrics
- [ ] Deploy to test environment
- [ ] Run live tests with cleanup
- [ ] Monitor performance
- [ ] Gradual production rollout
- [ ] Add advanced features

## Security Considerations

1. **Rate Limiting**: Prevent spam by limiting notifications per user per hour
2. **Signature Verification**: Always verify Nostr event signatures
3. **Privacy**: Don't log sensitive content, only metadata
4. **Access Control**: Validate user ownership of push endpoints

## Performance Targets

- Process 10,000 events per minute
- Sub-200ms notification delivery
- 99.9% uptime
- Less than 10MB KV storage per 1000 users

## YOLO Testing Commands

```bash
# Run all notification tests
npm run test:notifications

# Test specific scenario
npm run test:mention-detection

# Monitor live system
npm run monitor:notifications

# Clean up any orphaned test events
npm run cleanup:test-events
```

Remember: YOLO testing means we test on production relays but ALWAYS clean up after ourselves! 🚀
