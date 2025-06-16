/**
 * Simple Push Notification Service
 * Handles Web Push encryption and delivery
 * Can be deployed as a separate microservice or serverless function
 */

const webpush = require('web-push');
const express = require('express');
const app = express();

app.use(express.json());

// CORS for worker
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure web-push
webpush.setVapidDetails(
  'mailto:support@chorus.community',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'push-notification-service' });
});

// Send push notification
app.post('/send', async (req, res) => {
  // Verify authorization
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.SERVICE_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subscription, payload } = req.body;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    res.json({ success: true });
  } catch (error) {
    console.error('Push error:', error);
    
    // Handle specific errors
    if (error.statusCode === 410) {
      // Subscription expired
      res.status(410).json({ error: 'Subscription expired' });
    } else {
      res.status(500).json({ error: 'Failed to send notification' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Push service running on port ${PORT}`);
});