/**
 * YOLO Testing Utilities - Test with real relays and clean up after
 */

import { SimplePool, Event, getEventHash, getSignature, generatePrivateKey, getPublicKey } from 'nostr-tools';

export class YOLOTester {
  private pool: SimplePool;
  private testEvents: string[] = []; // Track events to delete
  private testPrivkey: string;
  
  constructor(privkey: string) {
    this.pool = new SimplePool();
    this.testPrivkey = privkey;
  }

  /**
   * Publish test event and track for cleanup
   */
  async publishTestEvent(relays: string[], event: Partial<Event>): Promise<Event> {
    const fullEvent: Event = {
      ...event,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: getPublicKey(this.testPrivkey),
      id: '',
      sig: ''
    } as Event;
    
    fullEvent.id = getEventHash(fullEvent);
    fullEvent.sig = getSignature(fullEvent, this.testPrivkey);
    
    // Publish to relays
    await Promise.all(this.pool.publish(relays, fullEvent));
    
    // Track for cleanup
    this.testEvents.push(fullEvent.id);
    
    console.log(`✅ Published test event ${fullEvent.id}`);
    return fullEvent;
  }

  /**
   * YOLO Cleanup - Delete all test events
   */
  async cleanupTestEvents(relays: string[]): Promise<void> {
    console.log(`🧹 Cleaning up ${this.testEvents.length} test events...`);
    
    for (const eventId of this.testEvents) {
      const deleteEvent: Partial<Event> = {
        kind: 5, // Deletion event
        tags: [['e', eventId]],
        content: 'YOLO test cleanup'
      };
      
      const fullDelete: Event = {
        ...deleteEvent,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: getPublicKey(this.testPrivkey),
        id: '',
        sig: ''
      } as Event;
      
      fullDelete.id = getEventHash(fullDelete);
      fullDelete.sig = getSignature(fullDelete, this.testPrivkey);
      
      await Promise.all(this.pool.publish(relays, fullDelete));
      console.log(`🗑️ Deleted event ${eventId}`);
    }
    
    this.testEvents = [];
    this.pool.close(relays);
  }

  /**
   * Run test scenario with automatic cleanup
   */
  async runTestScenario(
    name: string,
    relays: string[],
    scenario: () => Promise<void>
  ): Promise<void> {
    console.log(`\n🚀 YOLO Test: ${name}`);
    console.log('='.repeat(50));
    
    try {
      await scenario();
      console.log(`✅ Test "${name}" completed successfully`);
    } catch (error) {
      console.error(`❌ Test "${name}" failed:`, error);
      throw error;
    } finally {
      // Always cleanup, even if test fails
      await this.cleanupTestEvents(relays);
      console.log(`✨ Cleanup complete for "${name}"`);
    }
  }
}

// Helper to generate test keypairs
export function generateTestKeypair() {
  const privkey = generatePrivateKey();
  const pubkey = getPublicKey(privkey);
  return { privkey, pubkey };
}
