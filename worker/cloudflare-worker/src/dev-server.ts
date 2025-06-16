import { PushService } from './push-service';
import { WebPush } from './web-push';
import { PushMetrics } from './push-metrics';
import { PushLogger } from './push-logger';
import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

// Create a local KV store
const localKV = new Map<string, string>();

// Helper to read request body as string
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Mock environment for local development
const env = {
  KV: {
    get: async <T>(key: string, type?: 'text' | 'json'): Promise<T | null> => {
      const value = localKV.get(key);
      if (!value) return null;
      return type === 'json' ? JSON.parse(value) : value as T;
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      localKV.set(key, value);
    },
    delete: async (key: string) => {
      localKV.delete(key);
    },
    list: async (options?: { prefix?: string }) => ({
      keys: Array.from(localKV.keys())
        .filter(key => !options?.prefix || key.startsWith(options.prefix))
        .map(name => ({ name }))
    })
  },
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || 'test-public-key',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || 'test-private-key',
  PUSH_QUEUE: {
    idFromName: (name: string) => ({
      toString: () => name
    }),
    get: () => ({
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/process') {
          // Process queued notifications
          const pushService = new PushService(env);
          const result = await pushService.processQueue();
          return new Response(JSON.stringify(result));
        }

        return new Response('Not found', { status: 404 });
      }
    })
  }
};

// Initialize services
const pushService = new PushService(env);
const webPush = new WebPush(env);
const metrics = new PushMetrics(env);
const logger = new PushLogger(env);

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // Register push subscription
    if (path === '/register' && req.method === 'POST') {
      console.log('Received /register request');
      const body = await readBody(req);
      console.log('Request body:', body);
      try {
        const { npub, subscription } = JSON.parse(body);
        const result = await pushService.registerSubscription(npub, subscription);
        console.log('registerSubscription result:', result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: result }));
      } catch (err) {
        console.error('Error in /register handler:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // Send test notification
    if (path === '/test-notification' && req.method === 'POST') {
      console.log('Received /test-notification request');
      const body = await readBody(req);
      console.log('Request body:', body);
      try {
        const { npub } = JSON.parse(body);
        const subscription = await pushService.getSubscription(npub);
        console.log('getSubscription result:', subscription);
        if (!subscription) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No subscription found' }));
          return;
        }

        const payload = {
          title: 'Test Notification',
          body: 'This is a test notification',
          data: {
            url: '/test',
            type: 'test',
            priority: 'high' as const
          }
        };

        const result = await pushService.sendNotification(subscription, payload);
        console.log('sendNotification result:', result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: result }));
      } catch (err) {
        console.error('Error in /test-notification handler:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // Get metrics
    if (path === '/metrics' && req.method === 'GET') {
      console.log('Received /metrics request');
      try {
        const currentMetrics = await metrics.getMetrics();
        console.log('metrics.getMetrics result:', currentMetrics);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentMetrics));
      } catch (err) {
        console.error('Error in /metrics handler:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }

    // Get logs
    if (path === '/logs' && req.method === 'GET') {
      console.log('Received /logs request');
      try {
        const logs = await logger.getLogs();
        console.log('logger.getLogs result:', logs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
      } catch (err) {
        console.error('Error in /logs handler:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (error) {
    console.error('Error handling request:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Development server running at http://localhost:${PORT}`);
});

// Export for testing
export { env, pushService, webPush, metrics, logger }; 