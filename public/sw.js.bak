// Bare minimum service worker for PWA functionality
// No caching - just enough to be considered a PWA

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event - pass through all requests to network
self.addEventListener('fetch', (event) => {
  // Simply pass through all requests without caching
  event.respondWith(fetch(event.request));
});