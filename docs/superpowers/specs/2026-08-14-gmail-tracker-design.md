# Personal Gmail Tracker — Design Spec

Date: 2026-08-14
Status: Approved

## Purpose

A single-user tool that tracks when the user's sent Gmail emails are opened and when
links inside them are clicked, surfaced as checkmarks inside the Gmail UI and in a
full dashboard. No accounts (beyond the one owner), no multi-tenancy, no billing, no
store distribution, no mobile.

## Architecture

```
Chrome Extension (unpacked)          Next.js App (webapp/) + Supabase (Postgres)
──────────────────────────           ──────────────────────────────────────────
 compose pre-send hook                 GET  /p/[token]         → log open, return GIF
   ├─ inject pixel                     GET  /c/[token]/[i]     → log click, redirect
   ├─ rewrite links        ──────►     POST /api/sent          → register email
   └─ POST metadata                    GET  /api/status        → batch thread states
                                        /dashboard              → full dashboard UI
 thread list observer       ◄──────
   └─ inject ✓/✓✓ + tooltip
 declarativeNetRequest
   └─ block self-opens
```

Two folders in this repo:
- `webapp/` — Next.js 15 (App Router), Supabase (Postgres + Auth), deployed to Vercel.
- `extension/` — Chrome MV3 extension, TypeScript, Vite + CRXJS, @inboxsdk/core.

There is no Cloudflare Worker in this design. The original brief used Workers to sit
next to D1 at the edge; once the database is Supabase/Postgres, that locality benefit
disappears, so the tracking endpoints live as Next.js Route Handlers instead —
one deployable, one codebase, one place secrets live. The tradeoff (Vercel function
latency vs. Cloudflare edge Worker latency) is imperceptible at single-user volume.

## Data model (Supabase / Postgres)

```sql
emails(
  id, token_hash, thread_id, subject, recipient_count,
  sent_at, tracking_enabled
)

links(
  id, email_id, idx, url, sig
)

events(
  id, email_id, link_id, type, at,
  ip_hash, ua_hash, is_proxy, is_self, confidence
)
-- type: 'prefetch' | 'open' | 'click'
-- index on events(email_id, at)
```

Row Level Security is enabled; all writes/reads go through the Next.js server (service
role key, server-only env var). Neither the extension nor a browser ever talks to
Supabase directly.

## Auth

- **Dashboard**: Supabase Auth, email/password, exactly one account (the owner). All
  `/dashboard/*` routes and the `/api/status` route require a valid session.
- **Extension ↔ webapp**: a separate shared secret, generated once and stored in
  `chrome.storage.local`, sent as a `Bearer` header on `/api/sent` and `/api/status`.
  This is independent of the dashboard's Supabase session because the extension is not
  a browser session against the webapp.
- **`/p/[token]` and `/c/[token]/[i]`** are intentionally public — recipients' mail
  clients must be able to hit them with no auth.

## Accuracy layer (non-negotiable, build and test before any UI)

Without this the tool reports 100% opens and is worthless.

1. **Proxy/prefetch detection**: Gmail proxies all images through
   googleusercontent.com and prefetches them on delivery, before a human sees
   anything.
   - Detect via User-Agent containing `GoogleImageProxy`, or source IP in Google's
     published ranges.
   - Any such fetch within 90s of `sent_at` → `type = 'prefetch'`, never counted as an
     open.
2. **Dedup**: collapse events matching `(email_id, ip_hash, ua_hash)` within a rolling
   3-minute window into a single open. Implemented as a `SELECT` immediately before
   `INSERT` — no queue, no Redis, plain Postgres.
3. **Self-opens**: viewing your own sent mail fires the pixel.
   - Extension registers a `declarativeNetRequest` rule matching the pixel host and
     `*://*.googleusercontent.com/proxy/*`, redirecting to `/api/noop` rather than
     canceling (keeps the network log clean).
   - Server-side fallback: mark `is_self` if the request's IP hash matches one the
     extension reported via a heartbeat call in the last 24h.
4. **Apple Mail Privacy Protection** preloads via Apple's private relay — detect via
   its known UA/IP pattern and mark confidence low. This is unbeatable by design; the
   tooltip is honest about it rather than pretending certainty.
5. Every event stores a `confidence` score (0–100). The UI treats `>= 60` as a real
   open. The raw event log (including prefetches and low-confidence events) stays
   fully viewable in the dashboard — nothing is silently dropped.

Tests for this layer are written first, against recorded fixture requests (a real
`GoogleImageProxy` UA, a real Apple relay UA, a normal browser UA) — this is the one
place with real test coverage in the project, per the working style below.

## Security

- Tokens are HMAC-signed opaque IDs — never sequential, so no one with a single pixel
  URL can enumerate the owner's send history.
- The click redirect (`/c/[token]/[i]`) validates the destination against the signed,
  stored `links` row. Anything not `http`/`https` is rejected. No open redirect.
- Pixel response: 42-byte transparent GIF, `Cache-Control: no-store, no-cache,
  must-revalidate, private`.

## Gmail DOM integration

Gmail is a SPA that recycles DOM nodes constantly.
- Compose: InboxSDK's `composeView` `presending` hook — covers the send button,
  Ctrl+Enter, and scheduled send.
- Thread list: a `MutationObserver` watching for row insertion, injecting ✓ / ✓✓.
- Every Gmail selector lives in one file, `extension/src/gmail/selectors.ts`, each
  with a comment naming what it targets, so a Gmail DOM change is a one-file fix.

## UI surface

**In Gmail (via extension):**
- ✓ = sent and tracked, ✓✓ = opened, shown in the Sent/thread list.
- Hover tooltip: open count, first open, last open, clicked links, confidence caveats
  (e.g. "Apple Mail — open unconfirmed").
- A checkbox in the compose toolbar to disable tracking for one email.

**Dashboard (`webapp/`, behind Supabase Auth login) — this is where the design goes
beyond the original plain-HTML `/stats` page, since Next.js is now the whole backend
anyway. Visual/feature reference: Mailsuite's home screen (activity feed + performance
stats) — same idea, single-user, no team features:**
- Home: a "Latest Activity" feed (most recent opens/clicks, newest first, "2nd time"
  labels for repeat events) and a "My performance" panel — sent emails, opening rate
  (opened/sent), average time-to-open — computed from `events`/`emails`, no separate
  analytics store.
- Sent list: sortable/filterable by status, date, subject.
- Email detail view: open timeline, click timeline, per-link breakdown, confidence
  badges, and the raw event log for that email.
- Simple charts: opens over time, top-clicked links. No dashboard-framework sprawl —
  a couple of readable charts, not a BI tool.
- Per-email tracking toggle, and the ability to view/delete raw events.

## Explicitly out of scope

OAuth / Gmail API, mail merge, notifications/reminders, PDF tracking, a mobile add-on,
teams, billing, a queue/Redis (the Postgres dedup query is sufficient at this volume),
Chrome Web Store distribution.

## Multi-recipient caveat

One message body means one pixel. If an email is sent to multiple recipients, opens
are unattributed to a specific person — the UI must not imply per-recipient
attribution it cannot actually provide.

## Working style / build phases

Same phased approach as the original brief, adapted to the collapsed stack:

1. **Session 1 — Backend, proven end to end.** Supabase schema migrated, `/p`, `/c`,
   `/api/sent` implemented and manually verified with a real email round-trip.
   Gate: a real open event from a real email sitting in Supabase.
2. **Session 2 — Accuracy layer, before any UI.** Proxy detection, prefetch
   suppression, dedup, confidence scoring, fixture test suite.
   Gate (manual): delivery prefetch is not counted as an open; 3 rapid opens dedup to
   1; viewing your own sent mail logs 0 opens.
3. **Session 3 — Dashboard.** Supabase Auth login, sent list, detail view, charts.
4. **Session 4 — Extension.** Vite + CRXJS scaffold, InboxSDK wired, pre-send hook,
   declarativeNetRequest self-open blocking, thread list observer, compose toolbar
   toggle.
   Gate: send a normal email from Gmail, watch it turn ✓✓ when opened, and see it in
   the dashboard.

Rules carried over from the original brief: one phase per session, stop at each gate
for manual verification; files under 200 lines; no mock data committed — throw if
unbuilt; no abstractions added "for later."
