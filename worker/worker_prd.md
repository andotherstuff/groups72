# PRD: Web‑Push Notifications for React Web App & PWA (nostr content)

---

## 1   Objective

Implement privacy‑respecting, cross‑platform push notifications that alert users of new nostr content discovered by our relay‑monitoring bot, regardless of whether the user is browsing in‑app, has installed the PWA, or is offline.

## 2   Background / Context

* **Product**: React single‑page web app, installable as a Progressive Web App (PWA).
* **Content Source**: nostr relays; a backend bot already monitors relays and flags new events relevant to each user.
* **Gap**: Native iOS/Android apps already push; web users must currently poll.

## 3   Goals & Success Metrics

| Goal                             | Metric                                                  | Target      |
| -------------------------------- | ------------------------------------------------------- | ----------- |
| Timely delivery of notifications | Median latency (event → notification displayed)         | ≤ 5 seconds |
| Opt‑in rate                      | % DAU who grant push permission                         | ≥ 40 %      |
| Engagement lift                  | Increase in notification‑tab opens within 5 min of push | ≥ 20 %      |
| Error rate                       | Failed push sends / total sends                         | < 1 %       |

## 4   Non‑Goals

* Native mobile push (already solved).
* Rich media notifications (images, actions) in v1.
* Fine‑grained per‑relay mute settings (deferred).

## 5   User Stories

* **U1**   *As a logged‑in web user*, I want to receive a system notification when a friend posts,
  so I can open the app and reply.
* **U2**   *As a PWA user with the app closed*, I want the app icon badge to update after a push.
* **U3**   *As a user with multiple devices*, I expect notifications only on devices where I granted permission.
* **U4**   *As a privacy‑conscious user*, I want to be able to disable push at any time.

## 6   Functional Requirements

1. **Subscription capture** — Browser must register Service Worker (SW), request `Notification` & `Push` permissions, and upload Push Subscription to backend.
2. **Bot trigger** — When `nostr‑bot` detects an event relevant to user *U*, it calls `POST /push/dispatch` with `{ userId, event }`.
3. **Dispatch service** — Backend looks up all active Push Subscriptions for *U*, sends `web‑push` payloads.
4. **SW display** — SW shows native notification with title/body and stores relay pointer in `notification.data`.
5. **Deep link** — Clicking notification opens (or focuses) `/#/notifications` and passes relay pointer so React fetches content.
6. **Foreground sync** — If any app tab is already open, SW `postMessage`s tabs to refresh notification count silently.
7. **Unsubscribe hygiene** — Expired subscriptions (4xx/410 responses) are pruned automatically.
8. **Opt‑out UI** — Settings screen lists devices & allows delete.

## 7   Non‑Functional Requirements

* **Security** — Use VAPID; payloads encrypted; no third‑party push‑proxy.
* **Privacy** — Store only opaque subscription JSON + userId; no geo or device fingerprint.
* **Performance** — Dispatch throughput ≥ 1 000 notifications/second.
* **Reliability** — Retry w/ exponential backoff; alerting on error spike.
* **Compatibility** — Chrome ≥ 109, Edge ≥ 109, Firefox ≥ 102, Safari ≥ 16.4 (limited).

## 8   System Architecture (v1)

```
nostr‑relays  →  nostr‑bot  →  Push Dispatch API  →  web‑push lib
                                            ↘                 ↘
       Postgres (subscriptions) ←────────────┘                 Browsers (Service Workers)
```

* **nostr‑bot**   Rust service parsing events, already deployed.
* **Push Dispatch API**   Node/TS service exposing `/subscriptions` and `/push/dispatch`.
* **Postgres**   `push_subscriptions` table: `{ id, user_id, endpoint, p256dh, auth, created_at, last_seen }`.
* **Clients**   React SPA + Service Worker (`sw.js`).

## 9   Data Model

```sql
CREATE TABLE push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_seen     TIMESTAMPTZ
);
CREATE UNIQUE INDEX ON push_subscriptions(user_id, endpoint);
```

## 10  API Surface

| Method   | Path                 | Auth       | Body                    | Description                    |
| -------- | -------------------- | ---------- | ----------------------- | ------------------------------ |
| `POST`   | `/subscriptions`     | JWT cookie | `PushSubscription` JSON | Save or refresh a subscription |
| `DELETE` | `/subscriptions/:id` | JWT        | –                       | Delete subscription            |
| `POST`   | `/push/dispatch`     | bot token  | `{ userId, event }`     | Send notification (internal)   |

## 11  Service Worker Outline (`sw.js`)

```js
self.addEventListener('push', evt => {
  const data = evt.data?.json() ?? { title: 'New content', body: '' };
  evt.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        data
      }),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => clients.forEach(c => c.postMessage({ type: 'NEW_NOTIF' })))
    ])
  );
});

self.addEventListener('notificationclick', evt => {
  evt.notification.close();
  const url = '/#/notifications?relay=' + encodeURIComponent(evt.notification.data.relay);
  evt.waitUntil(clients.openWindow(url));
});
```

## 12  Implementation Plan (6 weeks)

| Week | Milestone                                                                      |
| ---- | ------------------------------------------------------------------------------ |
| 1    | Generate VAPID keys, scaffold Push Dispatch API & DB table                     |
| 2    | Service Worker skeleton; feature flag in React; subscription capture & save    |
| 3    | Bot → API integration; minimal notification payload                            |
| 4    | In‑app notification‑tab refresh via `postMessage`; settings UI for device list |
| 5    | Cross‑browser testing; clean‑up expired subscriptions; alerts                  |
| 6    | Beta rollout (10 % traffic); metrics dashboards; full launch                   |

## 13  LLM Agent Task Catalogue & Suggested Prompts

> **Usage**: Paste prompt to internal “DevGPT” agent; provide context repo link.

| # | Task                       | Role     | Prompt (example)                                                                                                                                                      |
| - | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Generate VAPID keys script | DevOps   | *"Write a Node script that checks for existing VAPID keys in Vault and generates + stores new ones if absent. Output public key in .env format."*                     |
| 2 | API scaffolding            | Backend  | *"Create an Express router with endpoints `/subscriptions` (POST, DELETE) and `/push/dispatch` (POST). Use Zod for request validation and Postgres via Drizzle ORM."* |
| 3 | DB migration               | Backend  | *"Produce SQL migration for `push_subscriptions` table with constraints described in section 9."*                                                                     |
| 4 | Service Worker             | Frontend | *"Add `sw.js` with push & notificationclick handlers per PRD. Use TypeScript where possible."*                                                                        |
| 5 | React hook                 | Frontend | *"Implement `usePushSubscription()` hook that registers SW, requests permission, subscribes with VAPID public key, and POSTs subscription to API."*                   |
| 6 | Bot integration            | Backend  | *"Extend existing Rust nostr‑bot: on matching event, call `POST /push/dispatch`. Include JWT bot token from env."*                                                    |
| 7 | Monitoring                 | DevOps   | *"Create Prometheus metrics exporter for notification send latency & errors; Grafana dashboard template."*                                                            |
| 8 | E2E tests                  | QA       | *"Write Playwright tests: (a) Opt‑in flow, (b) Receive push while tab closed, (c) Click opens notifications tab with correct query param."*                           |
| 9 | Documentation              | Docs     | *"Draft README section explaining how to debug Service Worker and how to manually send a test push using `web-push` CLI."*                                            |

## 14  Testing & QA

* Unit tests for subscription API (Jest).
* Playwright E2E with Chrome & Firefox, Safari Technology Preview manual.
* Load‑test dispatch path with 100 k subs using artillery.
* Security review: VAPID keys in Vault, JWT scopes.

## 15  Rollout & Comms

* **Phase 0** — Internal dogfood; feedback channel in #qa.
* **Phase 1** — 10 % random cohort for 48 h; monitor metrics.
* **Phase 2** — 100 % rollout; blog post & in‑app tooltip.

## 16  Open Questions

1. Safari push requires APNs + Web Push ID; accept lower coverage for v1?
2. Badge counts: do we store unread counts server‑side or compute client‑side?
3. Granular preference center (e.g., @mention only) scope & timeline.

---

## 17  Cloudflare Worker + KV Poller for nip‑72 Public Groups

### 17.1  Purpose

A lightweight Worker runs close to the edge, periodically inspecting the nip‑72 relay for **public‑group events** relevant to our active users.  It queues push notifications via the existing Push Dispatch API—without relying on the heavier `nostr-bot` service—providing low‑latency alerts even if core infra is degraded.

### 17.2  KV Namespaces

| Namespace         | Key                         | Value                           | TTL / Notes                                                |
| ----------------- | --------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `relay_last_seen` | `<relayId>:<kind>:<pubkey>` | `2025‑05‑23T17:05:42Z` (ISO)    | No TTL; tracks cursor so polling is idempotent             |
| `online_users`    | `<userId>`                  | epoch seconds of last heartbeat | 900 s TTL; app pings `/heartbeat` Worker route every 5 min |
| `event_cache`     | `<eventId>`                 | JSON blob of relay event        | 1 h TTL; dedup + avoid re‑push                             |

### 17.3  Worker Flow

```js
// 1️⃣ CRON trigger (every 30 s)
export async function scheduled(event, env, ctx) {
  const relay = await openRelay(env.RELAY_URL);  // nip‑72 websocket
  const since = await env.KV.get(`relay_last_seen:${relay.id}`) || 0;
  const events = await relay.fetchSince(since);

  for (const e of events) {
    if (await env.KV.get(`event_cache:${e.id}`)) continue; // dedup
    const targets = determineTargets(e, env);
    await queuePushNotifications(targets, e, env);
    ctx.waitUntil(env.KV.put(`event_cache:${e.id}`, JSON.stringify(e), { expirationTtl: 3600 }));
  }
  const newest = events.at(-1)?.created_at;
  if (newest) await env.KV.put(`relay_last_seen:${relay.id}`, newest.toString());
}

// 2️⃣ HTTP route for heartbeat
export async function fetch(req, env) {
  if (req.method === 'PUT' && new URL(req.url).pathname === '/heartbeat') {
    const { userId } = await req.json();
    await env.KV.put(`online_users:${userId}`, Date.now().toString(), { expirationTtl: 900 });
    return new Response('OK');
  }
  return new Response('Not found', { status: 404 });
}
```

*`determineTargets()`* filters only **currently‑online** users (present in `online_users`) unless the event is high priority (mentions, direct replies), in which case offline users are included as well.

### 17.4  Push Dispatch Integration

The Worker does **not** send Web Push itself (to avoid including VAPID keys in edge code).  Instead it POSTs to `/push/dispatch` on the core API, re‑using the contract defined in section 10.  If the core API is unreachable it retries with exponential backoff via `ctx.waitUntil()`.

### 17.5  Deployment Notes

```toml
# wrangler.toml
name = "nostr-nip72-poller"
main = "src/worker.js"
compatibility_date = "2025-05-23"
kv_namespaces = [
  { binding = "KV", id = "<id>" }
]
crons = ["*/0.5 * * * * *"] # every 30 s
vars = { RELAY_URL = "wss://relay.chorus.community/" }
```

### 17.6  Additional LLM Task Prompts

| #  | Task                       | Prompt                                                                                                                                                  |
| -- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 | Cloudflare Worker scaffold | *"Generate a Workers project with wrangler v3. Add `/heartbeat` route and a `scheduled` handler that polls nip‑72 relay as described in section 17.3."* |
| 11 | KV schema migration doc    | *"Create a markdown doc that explains the KV namespaces, keys, and TTL policies for ops hand‑off."*                                                     |
| 12 | Relay polling utility      | *"Write a minimal Nostr client in TypeScript that runs in Workers runtime (no Node APIs) and streams events newer than a given timestamp."*             |
| 13 | Integration tests          | *"Using Miniflare, write tests that mock relay responses and assert that Push Dispatch API receives the correct payloads."*                             |

*Add these tasks to the overall project board under the new **Edge Infra** epic.*

---

*End of document*

