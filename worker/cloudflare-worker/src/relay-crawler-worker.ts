/**
 * Relay Crawler Worker
 * Crawls Nostr relays every minute to fetch and index events
 */

/// <reference types="@cloudflare/workers-types" />

import { NostrEvent, verifyEvent, Filter } from 'nostr-tools';

export interface Env {
  KV: KVNamespace;
  RELAY_URLS: string;
  WORKER_AUTH_TOKEN?: string;
}

interface CrawlResult {
  relay: string;
  eventCount: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

interface CrawlStats {
  lastCrawl: number;
  totalEvents: number;
  successfulRelays: number;
  totalRelays: number;
  avgEventsPerRelay: number;
  crawlDuration: number;
}

export default {
  /**
   * Scheduled event - runs every minute
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const timestamp = new Date(event.scheduledTime).toISOString();
    console.log(`🕷️ Relay crawler triggered at ${timestamp}`);
    
    ctx.waitUntil(this.crawlRelays(env));
  },

  /**
   * HTTP endpoint for health checks and manual triggers
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/health': {
        const lastCrawl = await env.KV.get('last_crawl_time');
        const crawlStats = await env.KV.get('crawl_stats', 'json') as CrawlStats | null;
        
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'relay-crawler',
          lastCrawl,
          stats: crawlStats
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
        
      case '/trigger': {
        // Manual trigger for testing
        if (env.WORKER_AUTH_TOKEN) {
          const auth = request.headers.get('Authorization');
          if (auth !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
            return new Response('Unauthorized', { status: 401 });
          }
        }
        
        await this.crawlRelays(env);
        return new Response(JSON.stringify({ 
          status: 'triggered',
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
        
      case '/stats': {
        const stats = await env.KV.get('crawl_stats', 'json') as CrawlStats | null;
        const history = await env.KV.list({ prefix: 'crawl_history:' });
        
        return new Response(JSON.stringify({
          currentStats: stats,
          historyCount: history.keys.length
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
        
      default:
        return new Response('Not Found', { status: 404 });
    }
  },

  /**
   * Main crawling logic
   */
  async crawlRelays(env: Env): Promise<void> {
    const startTime = Date.now();
    const relayUrls = env.RELAY_URLS.split(',').map(url => url.trim()).filter(url => url.length > 0);
    
    console.log(`📡 Starting crawl of ${relayUrls.length} relays`);
    
    const results: CrawlResult[] = [];
    
    try {
      // Get last crawl timestamp
      const lastCrawlStr = await env.KV.get('last_crawl_time');
      const lastCrawl = lastCrawlStr ? parseInt(lastCrawlStr) : Date.now() - 60000; // Default to 1 minute ago
      const since = Math.floor(lastCrawl / 1000); // Convert to Unix timestamp
      
      // Crawl each relay
      const crawlPromises = relayUrls.map(relay => 
        this.crawlRelay(relay, since, env)
          .then(result => {
            results.push(result);
            return result;
          })
      );
      
      // Wait for all crawls to complete (with timeout)
      await Promise.race([
        Promise.all(crawlPromises),
        new Promise(resolve => setTimeout(resolve, 50000)) // 50 second timeout
      ]);
      
      // Process and store results
      const totalEvents = results.reduce((sum, r) => sum + r.eventCount, 0);
      const successfulRelays = results.filter(r => r.success).length;
      
      // Update stats
      const stats = {
        lastCrawl: Date.now(),
        totalEvents,
        successfulRelays,
        totalRelays: relayUrls.length,
        avgEventsPerRelay: totalEvents / successfulRelays || 0,
        crawlDuration: Date.now() - startTime
      };
      
      await env.KV.put('crawl_stats', JSON.stringify(stats));
      await env.KV.put('last_crawl_time', Date.now().toString());
      
      // Store crawl history (keep last 60 entries)
      const historyKey = `crawl_history:${Date.now()}`;
      await env.KV.put(historyKey, JSON.stringify({
        timestamp: Date.now(),
        results,
        stats
      }), { expirationTtl: 3600 }); // Keep for 1 hour
      
      console.log(`✅ Crawl completed: ${totalEvents} events from ${successfulRelays}/${relayUrls.length} relays in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      console.error('Error during crawl:', error);
      await env.KV.put('last_crawl_error', JSON.stringify({
        error: error.message,
        timestamp: Date.now()
      }));
    }
  },

  /**
   * Crawl a single relay
   */
  async crawlRelay(relayUrl: string, since: number, env: Env): Promise<CrawlResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🕷️ Crawling ${relayUrl} for events since ${new Date(since * 1000).toISOString()}`);
      
      // Create filters for different event types
      const filters: Filter[] = [
        // Group events (NIP-29)
        {
          kinds: [9, 10, 11, 12, 9007, 9008], // Group-related events
          since,
          limit: 100
        },
        // User metadata and reactions
        {
          kinds: [0, 3, 7],
          since,
          limit: 50
        },
        // Regular notes and replies
        {
          kinds: [1, 1111],
          since,
          limit: 100
        },
        // Moderation events
        {
          kinds: [4550, 4551],
          since,
          limit: 50
        }
      ];
      
      const events = await this.fetchFromRelay(relayUrl, filters, env);
      
      // Store events in KV (deduplicated by event ID)
      let storedCount = 0;
      for (const event of events) {
        const eventKey = `event:${event.id}`;
        const exists = await env.KV.get(eventKey);
        
        if (!exists) {
          await env.KV.put(eventKey, JSON.stringify(event), {
            expirationTtl: 86400 * 7 // Keep for 7 days
          });
          storedCount++;
          
          // Index by kind
          await env.KV.put(`index:kind:${event.kind}:${event.id}`, '1', {
            expirationTtl: 86400 * 7
          });
          
          // Index by author
          await env.KV.put(`index:author:${event.pubkey}:${event.id}`, '1', {
            expirationTtl: 86400 * 7
          });
        }
      }
      
      console.log(`✅ ${relayUrl}: Fetched ${events.length} events, stored ${storedCount} new events`);
      
      return {
        relay: relayUrl,
        eventCount: events.length,
        success: true,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error(`❌ Failed to crawl ${relayUrl}:`, error.message);
      
      return {
        relay: relayUrl,
        eventCount: 0,
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  },

  /**
   * Fetch events from a relay with WebSocket
   */
  async fetchFromRelay(relayUrl: string, filters: Filter[], env: Env): Promise<NostrEvent[]> {
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const ws = new WebSocket(relayUrl);
      const subId = 'crawl-' + Math.random().toString(36).substring(7);
      let eoseCount = 0;
      const expectedEoseCount = filters.length;
      
      // Set timeout
      const timeout = setTimeout(() => {
        console.log(`⏱️ Timeout reached for ${relayUrl}, closing connection`);
        ws.close();
        resolve(events);
      }, 30000); // 30 second timeout
      
      ws.addEventListener('open', () => {
        console.log(`📡 Connected to ${relayUrl}, sending ${filters.length} subscriptions`);
        // Send subscription
        ws.send(JSON.stringify(['REQ', subId, ...filters]));
      });
      
      ws.addEventListener('message', (msg) => {
        try {
          const data = JSON.parse(msg.data);
          
          if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
            const event = data[2];
            if (verifyEvent(event)) {
              events.push(event);
            }
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            // End of stored events for one filter
            eoseCount++;
            console.log(`📦 EOSE ${eoseCount}/${expectedEoseCount} for ${relayUrl}`);
            
            if (eoseCount >= expectedEoseCount) {
              clearTimeout(timeout);
              ws.close();
            }
          } else if (data[0] === 'NOTICE') {
            console.log(`📢 Notice from ${relayUrl}: ${data[1]}`);
          }
        } catch (error) {
          console.error(`Error parsing message from ${relayUrl}:`, error);
        }
      });
      
      ws.addEventListener('error', (error) => {
        console.error(`WebSocket error for ${relayUrl}:`, error);
        clearTimeout(timeout);
        resolve(events);
      });
      
      ws.addEventListener('close', () => {
        console.log(`🔌 Disconnected from ${relayUrl}, got ${events.length} events`);
        clearTimeout(timeout);
        resolve(events);
      });
    });
  }
};