# Trakk webapp

The Next.js backend and dashboard for a single-owner Gmail open and link-click
tracker. It issues HMAC-signed tracking URLs, classifies tracking accuracy signals,
and provides the owner-only dashboard used with `../extension`.

## Run locally

```bash
npm install
npm test
npx tsc --noEmit
npm run dev
```

Copy `.env.local.example` to `.env.local` and set:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
DASHBOARD_OWNER_EMAIL
TOKEN_SECRET
LINK_SIG_SECRET
EXTENSION_SHARED_SECRET
APP_BASE_URL
```

`APP_BASE_URL` must be the public HTTPS application URL in production. Set
`DASHBOARD_OWNER_EMAIL` to the exact email of the one Supabase Auth user allowed to
sign in at `/login`. Service-role credentials are server-only and must never be
included in the extension.

## Database migrations

`supabase/migrations/0001_init.sql` creates the tracker schema. Apply
`supabase/migrations/0002_accuracy_layer.sql` to add the hashed-IP heartbeat store
before deploying this version. The table is RLS-protected; only the server's service
role accesses it.

## Accuracy behavior

- Gmail proxy requests inside 90 seconds of send are recorded as `prefetch` with
  confidence `0`, never as a counted open.
- Events with the same email, IP hash, and user-agent hash are collapsed within a
  rolling three-minute window.
- The extension can `POST /api/heartbeat` with its bearer secret. The server hashes
  the request's source IP and marks matching events from the past 24 hours as
  `is_self`, with confidence `0`.
- Apple Mail privacy signals are retained as low-confidence raw events. Raw events
  are never deleted by the accuracy layer.
- Disabling `emails.tracking_enabled` now prevents all event logging for that email.

## API contracts

`POST /api/sent` requires `Authorization: Bearer <EXTENSION_SHARED_SECRET>` and
accepts `{ threadId, subject, recipientCount, links }`. It returns a pixel URL and
rewritten click URLs.

`POST /api/heartbeat` requires the same authorization and no request body. It
returns `204` when the source-IP heartbeat is stored.

`GET /api/noop` returns the transparent tracking GIF without logging an event. The
extension uses it as the safe redirect target for its self-open blocking rule.

`GET /api/status?threadIds=<comma-separated-gmail-thread-ids>` requires the extension
bearer secret and returns at most 100 batch thread states. It is intentionally for
the extension only; the dashboard reads richer data server-side.

`GET /p/[token]` always returns the tracking GIF. `GET /c/[token]/[i]` validates its
HMAC-signed stored link and redirects only to an `http` or `https` destination.

## Dashboard

Visit `/login` to access the responsive owner dashboard. It includes current activity,
open and click counts, a compact opens chart, searchable sent emails, per-link detail,
confidence labels, tracking controls, and raw-event deletion.
