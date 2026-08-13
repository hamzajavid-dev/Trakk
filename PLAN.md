# Personal Gmail Tracker — Master Plan & Handoff

> **Read this first when resuming.** This file exists because we ran out of usage
> mid-project. It captures everything decided, everything built, everything verified,
> and the full plan for what's left — so a fresh session (or a fresh Claude Code
> instance) can pick up with zero prior context and keep going without re-deriving
> decisions or re-discovering bugs we already found and fixed.

**Repo:** `d:\AI Automation Projects\Trakk` (local) / `https://github.com/hamzajavid-dev/Trakk` (remote, `master` branch, already pushed and in sync as of this writing).

**Related docs already in the repo — read these too, this file summarizes but doesn't replace them:**
- `docs/superpowers/specs/2026-08-14-gmail-tracker-design.md` — the approved design spec (source of truth for *what* to build)
- `docs/superpowers/plans/2026-08-14-webapp-backend-foundation.md` — the detailed Session 1 implementation plan (source of truth for *how* Session 1 was built, task-by-task with exact code)

---

## 1. What this project is

A single-user Gmail email-open and link-click tracker. You (the owner) send emails
normally through Gmail; a Chrome extension injects a tracking pixel and rewrites
links before send; a backend logs opens/clicks; a dashboard and in-Gmail checkmarks
(✓ sent, ✓✓ opened) show the results. No accounts beyond the owner, no OAuth, no
Gmail API, no multi-tenancy, no billing, no mobile, no Chrome Web Store listing.

## 2. Key decisions made during brainstorming (why the architecture is what it is)

These were real back-and-forth decisions with the user — knowing *why* matters if
anything downstream seems to contradict the original "brief" that kicked off this
project (an older brief mentioned Cloudflare Workers + D1; that was superseded):

1. **Cloudflare Workers + D1 → dropped. Next.js + Supabase (Postgres) instead.**
   The original brief used Workers to sit at the edge next to D1 for pixel/redirect
   latency. Once the user chose Supabase/Postgres as the database (for one shared DB
   usable from both a future dashboard and the tracking backend, and because they
   wanted real SQL/Postgres tooling), the edge-locality argument for Workers
   disappeared — a Worker calling out to Supabase over HTTP has no latency advantage
   over a Next.js Route Handler doing the same. So: **one Next.js app does
   everything** — tracking endpoints AND the dashboard, one deploy (Vercel), one
   codebase, one place secrets live. This was a deliberate simplification, not a
   downgrade — see spec's "Architecture" section for the full reasoning.

2. **No multi-account / no OAuth (for now).** The user floated wanting multiple Gmail
   accounts and OAuth login, inspired by a "Mailsuite" dashboard screenshot they
   shared. This was explicitly **descoped** — user said "skip that for now just
   build." Single owner, single Supabase Auth account, shared-secret bearer auth for
   the extension. If multi-account ever comes back, it's a deliberate future
   decision, not an oversight — don't silently add it back.

3. **Dashboard should look like a real product, not a bare stats page.** The user
   showed a "Mailsuite" screenshot (activity feed + performance stats + opening
   rate) as visual/feature inspiration — NOT as something to clone as a brand, just
   as a UX reference for "Latest Activity" feed and "My performance" stats panel.
   This is baked into the spec's UI Surface section.

4. **Byte-count correction:** the pixel GIF is **42 bytes**, not 43 as an earlier
   draft of the spec said. This was caught and fixed during implementation (Task 6)
   — both the spec and the code now correctly say 42.

5. **Next.js version:** the project runs **Next.js 16.3.0** (installed via
   `create-next-app@latest`), not Next.js 15 as the original spec draft assumed. This
   was corrected in the spec. It matters because Next 16 provides the `after()` API
   from `next/server`, which turned out to be load-bearing for correctness (see
   Session 1 summary below) — this is a genuine upside of the version bump, not just
   a version-number nitpick.

6. **No Cloudflare Worker exists anywhere in this codebase.** If you see references
   to Workers/D1 in old conversation history or an outdated brief, they are stale —
   ignore them. The spec doc is the corrected source of truth.

## 3. Session 1 — COMPLETE (webapp backend foundation)

Fully implemented, reviewed (per-task + final whole-branch review), and pushed to
`master`. This was built using Subagent-Driven Development (fresh implementer +
reviewer subagent per task, fix loops, final review) — see
`docs/superpowers/plans/2026-08-14-webapp-backend-foundation.md` for the exact
task-by-task plan that was executed.

### What exists right now

```
webapp/
  package.json, tsconfig.json, next.config.ts    -- Next.js 16.3.0, App Router, TS
  .env.local.example                              -- committed template (see below)
  .env.local                                       -- gitignored, has REAL secrets filled in
  supabase/migrations/0001_init.sql               -- schema, already run against live Supabase
  src/
    lib/
      hash.ts            -- sha256Hex(input), hashWithSecret(input, secret) [HMAC-SHA256]
      tokens.ts           -- createEmailToken(emailId, secret), verifyEmailToken(token, secret) -> emailId | null
                              (HMAC-signed opaque token: base64url(emailId) + "." + hmac, timing-safe verify)
      linkSig.ts           -- signLink(emailId, idx, url, secret), verifyLinkSig(...) -> boolean,
                              isSafeRedirectUrl(url) -> boolean (http/https only, rejects protocol-relative
                              and path-relative URLs too — tested)
      supabaseAdmin.ts     -- getSupabaseAdmin(): memoized server-only Supabase client (service role key)
      pixel.ts             -- PIXEL_GIF (42-byte transparent GIF Buffer), PIXEL_HEADERS (image/gif,
                              Cache-Control: no-store, no-cache, must-revalidate, private)
      env.ts               -- requireEnv(name): string — throws "X must be set" if missing, used
                              consistently across ALL THREE route handlers (added during final review fix)
      events.ts             -- logEvent(req, {emailId, linkId?, type}) — the ONLY place any route handler
                              touches the events table. Uses Next.js after() (from "next/server") to
                              guarantee the insert actually completes on serverless, without blocking the
                              response. Parses X-Forwarded-For correctly (first comma-separated entry
                              only — the full header is a proxy chain, not a stable per-client IP).
                              Swallows all errors so it can never crash the caller. (Added during final
                              review fix — this replaced an earlier "fire-and-forget without after()"
                              pattern that was CORRECT on `next dev` but would have SILENTLY DROPPED
                              EVENTS on Vercel/serverless. This was the one Critical finding in the whole
                              session — see "Traps already found" below.)
      __tests__/
        hash.test.ts, tokens.test.ts, linkSig.test.ts   -- Vitest, 17 tests, all passing
    app/
      api/sent/route.ts           -- POST /api/sent (Bearer EXTENSION_SHARED_SECRET auth)
                                      body: { threadId, subject, recipientCount, links: string[] }
                                      -> 201 { emailId, pixelUrl, links: [{idx, url, trackingUrl}] }
                                      Validates all link URLs with isSafeRedirectUrl before storing.
                                      Generates emailId client-side (crypto.randomUUID()) so token_hash
                                      can be computed and inserted in ONE write (no orphaned "pending"
                                      state — see traps below). Guards malformed JSON (400) and
                                      non-integer/non-positive recipientCount (400).
      p/[token]/route.ts          -- GET /p/[token] — the tracking pixel.
                                      ALWAYS returns 200 + the pixel GIF, no matter what (invalid token,
                                      missing env var, DB failure — nothing can make this endpoint return
                                      anything other than the pixel). Only logs an event (via logEvent)
                                      when the token verifies. This "always succeed" contract is airtight
                                      — traced and confirmed in the final review.
      c/[token]/[i]/route.ts      -- GET /c/[token]/[i] — click redirect.
                                      404 on: invalid token, unknown link index, signature mismatch
                                      (tamper defense), unsafe URL scheme. Only a fully verified,
                                      DB-stored, signature-checked URL is ever used as the redirect
                                      target — no open redirect possible. 302 redirect + logEvent on
                                      success.
```

### Database (Supabase project, already live)

- Project URL: `https://sbxsufeoodtawymzkfrj.supabase.co` (also in `webapp/.env.local`,
  gitignored — the service role key is there too, do not commit it)
- Schema already migrated (ran manually via Supabase SQL Editor): `emails`, `links`,
  `events` tables exactly as specced, RLS enabled on all three with no policies
  (service-role-key-only access, by design).
- `events.type` check constraint: `'prefetch' | 'open' | 'click'` — note `'prefetch'`
  is defined in the schema but **nothing writes it yet** — that's Session 2's job
  (proxy/prefetch detection).
- `events.confidence` defaults to `100`, `is_proxy`/`is_self` default to `false` —
  these are placeholder-correct for now; Session 2 replaces the defaults with real
  computed values.
- `emails.tracking_enabled` defaults to `true` but **nothing reads it yet** — no
  route handler checks this flag before logging. This needs to be wired up before or
  alongside Session 3's dashboard toggle, otherwise "turning tracking off" in the UI
  would be a lie (see parked finding below).

### Env vars (names only — real values are in the gitignored `webapp/.env.local`)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TOKEN_SECRET              -- 32-byte hex, HMAC key for email tokens
LINK_SIG_SECRET           -- 32-byte hex, HMAC key for link signatures
EXTENSION_SHARED_SECRET   -- 32-byte hex, Bearer auth for /api/sent (and future /api/status)
APP_BASE_URL              -- currently http://localhost:3000; must be updated to the real
                              public URL once deployed (Vercel) or tunneled
```
Template lives at `webapp/.env.local.example` (committed, no real values). To
regenerate secrets: `openssl rand -hex 32`.

### How to run it locally

```
cd webapp
npm install        # if node_modules isn't already there
npm run dev         # http://localhost:3000
npm test             # vitest run — 17 tests
npx tsc --noEmit     # typecheck
```

### Traps already found and fixed (do NOT reintroduce these)

These were real bugs caught during the per-task and final reviews. If you're writing
new code that touches these same areas (Session 2 will touch `events.ts` and both
route handlers heavily), watch for regressing these:

1. **Fire-and-forget without `after()` silently drops writes on serverless.** Any
   "log something after responding" pattern in a Next.js Route Handler MUST use
   `after()` from `next/server`, not a bare un-awaited promise. This was the one
   Critical finding in the final review — a bare fire-and-forget insert works fine
   on `next dev` (long-lived process) and would have failed silently in production
   (Vercel freezes/tears down the invocation right after the response is sent).
2. **`X-Forwarded-For` is a comma-separated proxy chain, not a single IP.** Always
   take `.split(",")[0].trim()`. Hashing the whole header breaks any logic that
   needs a stable per-client identifier (which Session 2's dedup absolutely needs).
3. **`process.env.X!` (non-null assertion) is not validation.** It's a compile-time
   no-op. Any handler reading a required secret must call `requireEnv("X")` from
   `webapp/src/lib/env.ts`, which actually throws at runtime with a clear message.
   For `/p/[token]` specifically, this throw must happen *inside* the same
   try/catch that wraps the DB logging, because that endpoint's contract is "always
   return the pixel, no matter what" — a missing env var must degrade to "don't log,
   still return the pixel," never to a 500.
4. **Two-step insert-then-update leaves orphaned rows on partial failure.**
   `POST /api/sent` originally inserted an `emails` row with a placeholder
   `token_hash: "pending"`, then updated it — if the update failed or an env var was
   missing in between, the row was stuck with `token_hash: "pending"` forever. Fixed
   by generating `emailId` client-side (`crypto.randomUUID()`) and computing
   `token_hash` before the (single) insert.
5. **The pixel GIF is 42 bytes, not 43.** If you see "43-byte" anywhere in new code
   or comments, it's wrong — verify with
   `Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7','base64').length` → `42`.

### Parked / deferred items (not blocking, but real — pick these up opportunistically)

- **`POST /api/sent`: a literal `null` JSON body bypasses validation and 500s**
  (instead of 400) at the `!body.threadId` check, because `null` parses as valid
  JSON but isn't an object. One-line fix when touched again:
  `if (!body || typeof body !== "object") return 400`.
- **`webapp/src/lib/events.ts` swallows Supabase insert errors with zero logging.**
  Not a regression (matches old behavior), but means a persistently failing DB write
  is invisible. Worth adding `console.error` (or better, once Session 2 exists,
  routing failures somewhere visible) when this file is next modified.
- **`emails.tracking_enabled` is never read.** No route handler checks it before
  logging an event. This must be wired in before Session 3 ships a UI toggle for it
  — otherwise the toggle would lie about what it's doing. Natural place: inside
  `logEvent` or just before calling it, load the `emails` row (already being loaded
  in `/c` for the link lookup; `/p` doesn't currently load it at all and would need
  to start).
- **`emails.token_hash` is written but never read by anything.** The token is
  self-verifying (HMAC), so this column is currently inert — not wrong, just
  currently-unused. Fine to leave; would only matter if a future revocation/lookup
  feature needed it.
- **Task 10 (the plan's "send a real Gmail email, confirm a real event lands in
  Supabase" gate) was never actually run against a real Gmail send.** Local tunnel
  tooling (`localtunnel`) kept crashing immediately after connecting on the user's
  Windows machine (root cause not diagnosed — possibly a firewall/AV interaction).
  The user chose to defer this rather than keep debugging tunnel tooling. **Strong
  recommendation: do this real-email test once Vercel deployment happens (Session
  2, 3, or whenever deploy first happens) — it kills two birds, since a real
  deployment gives a stable public URL without needing any tunnel at all.** Every
  individual endpoint has been verified end-to-end against the live Supabase
  project via curl (register → pixel hit → event row; register → click redirect →
  event row), so the *logic* is proven — only the literal "opened inside real
  Gmail, using its actual image-proxy behavior" leg is unverified. That real Gmail
  proxy behavior is also exactly what Session 2 needs to test against, so there's
  a good argument for folding the Task 10 gate into Session 2's first real test
  instead of doing it twice.

---

## 4. Session 2 — IMPLEMENTED LOCALLY — Accuracy layer (manual gate pending)

**This is the most important remaining session.** Per the spec: "Without this the
tool reports 100% opens and is worthless." Read the spec's "Accuracy layer" section
in full before starting
(`docs/superpowers/specs/2026-08-14-gmail-tracker-design.md`).

### What it needs to do

1. **Proxy/prefetch detection.** Gmail proxies all images through
   `googleusercontent.com` and prefetches them the moment the email is delivered —
   before any human sees it. Detect this via:
   - User-Agent containing `GoogleImageProxy`, or
   - Source IP falling in Google's published IP ranges.
   - Any such fetch within 90 seconds of `emails.sent_at` → log as
     `events.type = 'prefetch'`, never counted as a real open.
   - This means `/p/[token]/route.ts` needs to change from always logging
     `type: 'open'` to deciding `'prefetch'` vs `'open'` based on this detection.

2. **Dedup.** Collapse events matching `(email_id, ip_hash, ua_hash)` within a
   rolling 3-minute window into a single open. Spec says: "Implemented as a `SELECT`
   immediately before `INSERT` — no queue, no Redis, plain Postgres." This is why
   the IP-hash-parsing fix in Session 1 (finding 3, first-entry-of-XFF) mattered —
   dedup requires a *stable* per-client identifier, which is now correctly computed.

3. **Self-opens.** Viewing your own sent mail (in Gmail's Sent view) fires the pixel
   too. Two-layer defense:
   - Extension-side (Session 4 territory, but the *server fallback* is Session 2's
     job): register a `declarativeNetRequest` rule matching the pixel host and
     `*://*.googleusercontent.com/proxy/*`, redirecting to a to-be-built `/api/noop`
     route rather than canceling (keeps network logs clean on the extension side).
   - **Server-side fallback (this is Session 2's actual deliverable):** the
     extension periodically sends a "heartbeat" with its current IP to the server;
     an event is marked `is_self = true` if its `ip_hash` matches a heartbeat the
     extension reported in the last 24 hours. This requires a new endpoint (not
     explicitly named in the spec but implied — something like
     `POST /api/heartbeat`) and a place to store recent extension-reported IPs
     (could be a new small table, or reuse `events` with a synthetic type — needs a
     design decision when this session is planned in detail).

4. **Apple Mail Privacy Protection.** Apple's Private Relay preloads images from
   Apple's own infrastructure, unrelated to the recipient's actual open. Detect via
   Apple's known UA/IP pattern and mark `confidence` low. Spec is explicit: "This is
   unbeatable by design; the tooltip is honest about it rather than pretending
   certainty." Don't try to "solve" this — just detect and flag honestly.

5. **Confidence scoring.** Every event gets a `confidence` score 0–100 (column
   already exists, currently hardcoded to 100 everywhere). The UI (Session 3) will
   treat `>= 60` as a real, displayed open. Raw events (including prefetches and
   low-confidence ones) must stay visible in the dashboard — "nothing is silently
   dropped" per spec.

### Testing requirement (spec is explicit about this — don't skip it)

> "Tests for this layer are written first, against recorded fixture requests (a real
> `GoogleImageProxy` UA, a real Apple relay UA, a normal browser UA) — this is the
> one place with real test coverage in the project."

This means: before writing the detection logic, create fixture files/constants with
real recorded User-Agent strings (and ideally IP ranges) for: Google's image proxy,
Apple's Private Relay, and a normal browser. Write tests against those fixtures
FIRST (TDD), then implement the detection logic to make them pass. This is explicitly
called out as the one part of this whole project that deserves thorough test
coverage — everywhere else, tests exist but are lighter (unit tests on pure
functions like `tokens.ts`/`linkSig.ts`/`hash.ts`).

### Manual gate (from the original brief, still the right bar)

- Send an email → the delivery-time prefetch does **not** appear as a counted open.
- Open the email 3× within 10 seconds (simulating a recipient re-opening, or Gmail
  re-rendering) → **exactly 1** open logged, not 3.
- View your own sent copy in Gmail's Sent folder → **0** opens logged (self-open
  suppressed).

### Implementation completed in this session

- Added test-first request fixtures and accuracy classification tests for Gmail's
  image proxy, Apple Mail privacy traffic, and a normal browser.
- Added `src/lib/accuracy.ts`, which identifies Google proxy requests by UA or known
  IPv4 ranges; delivery-time proxy requests become `prefetch`, later proxy renders
  remain lower-confidence opens, and Apple Mail signals are low confidence.
- Reworked `logEvent` to load `sent_at`/`tracking_enabled`, look up a recent
  heartbeat, deduplicate pixel events over three minutes, and store the real
  `type`, `is_proxy`, `is_self`, and `confidence` values via `after()`.
- Chose a dedicated `heartbeats(ip_hash, seen_at)` table rather than synthetic events.
  `POST /api/heartbeat` is extension-secret protected, records the request source IP
  after hashing it, and upserts its last-seen time. No raw IP is stored.
- Added `GET /api/noop`, which returns the transparent GIF without tracking, ready for
  the Session 4 declarative-net-request self-open rule.
- Added `0002_accuracy_layer.sql`. It must be applied to the live Supabase project
  before deployment; Session 2 cannot complete its live manual gate until then and
  until the Session 4 extension sends its heartbeat.
- `npm test` (23 tests), `npx tsc --noEmit`, and `npm run build` all pass. Local HTTP
  checks confirm `/api/noop` returns the 42-byte GIF, unauthorized heartbeat returns
  `401`, and a literal `null` body to authenticated `/api/sent` returns `400`.

---

## 5. Session 3 — NOT STARTED — Dashboard

Depends on Session 2 being done first (the dashboard displays confidence-scored,
deduped, prefetch-filtered data — building it against raw undeduped data now would
mean redoing it).

### What it needs (from spec's "UI surface" → Dashboard section)

- **Supabase Auth** login (email/password, single owner account) gating all
  `/dashboard/*` routes.
- **Home page**: "Latest Activity" feed (most recent opens/clicks, newest first,
  with "2nd time" style labels for repeat events — this was explicitly modeled on
  the Mailsuite screenshot the user shared during brainstorming, not an arbitrary
  choice) and a "My performance" panel (sent count, opening rate = opened/sent,
  average time-to-open) — all computed from `events`/`emails`, no separate
  analytics store or pre-aggregation table needed at this scale.
- **Sent list**: sortable/filterable by status (✓/✓✓), date, subject.
- **Email detail view**: open timeline, click timeline, per-link breakdown,
  confidence badges (surfacing the Session 2 confidence scores honestly — e.g. "Apple
  Mail — open unconfirmed" per spec's tooltip language), and the raw event log for
  that specific email (nothing hidden, per spec's "nothing is silently dropped"
  principle).
- **Simple charts**: opens over time, top-clicked links. Spec is explicit: "No
  dashboard-framework sprawl — a couple of readable charts, not a BI tool." Don't
  reach for a heavy charting library or build a generic dashboard-builder
  abstraction.
- **Per-email tracking toggle** + ability to view/delete raw events. **This is where
  the parked `emails.tracking_enabled`-is-never-read gap (see Session 1 section
  above) must finally get wired up** — the toggle is pointless UI theater if no
  route handler actually checks the flag.

### Also needed (implied, not yet built)

- `GET /api/status` — batch thread-state endpoint (mentioned in the architecture
  diagram in the spec, used by the extension for in-Gmail ✓/✓✓ display) — this could
  arguably be built in Session 3 or Session 4, whichever comes first and needs it;
  not yet assigned to a specific session in detail.

---

## 6. Session 4 — NOT STARTED — Chrome Extension

The last piece. Depends on Session 1's `/api/sent` contract (already stable and
tested) and ideally Session 2's accuracy work (so the extension isn't shipping
against a backend that still reports 100% opens).

### What it needs (from spec)

- **Scaffold**: Vite + CRXJS, Manifest V3, TypeScript, `@inboxsdk/core` dependency.
- **Compose pre-send hook**: InboxSDK's `composeView` `presending` hook — spec calls
  out that this specifically covers the send button, Ctrl+Enter, AND scheduled send,
  which is the reason InboxSDK is worth the dependency over hand-rolled DOM hooking.
  On presend: inject the tracking pixel (`<img>` pointing at the `pixelUrl` from
  `/api/sent`'s response), rewrite every link to its `trackingUrl`, and POST the
  metadata to `/api/sent` to get those URLs in the first place.
- **Thread list observer**: a `MutationObserver` (not InboxSDK, per spec — Gmail's
  thread list recycles DOM nodes constantly, and the spec explicitly chose
  MutationObserver here) injecting ✓ (sent/tracked) or ✓✓ (opened) plus a hover
  tooltip (open count, first/last open, clicked links, confidence caveats).
- **`declarativeNetRequest`** rule to intercept the pixel host and
  `*://*.googleusercontent.com/proxy/*`, redirecting to `/api/noop` instead of
  canceling — this is the client-side half of Session 2's self-open suppression
  (the server-side heartbeat fallback needs this to actually be sending heartbeats
  for the fallback to have data to compare against).
- **Compose toolbar checkbox** to disable tracking for one specific email (maps to
  `emails.tracking_enabled` on that row).
- **Selector discipline**: spec is explicit — "Keep EVERY selector in one file
  (`extension/src/gmail/selectors.ts`) with a comment saying what it targets, so
  Gmail breaking me is a one-file fix." Don't scatter Gmail DOM selectors across
  multiple files.

### Manual gate

Send a normal email from Gmail (no special steps, no curl, no test harness) and
watch it visibly turn into ✓✓ inside the Gmail UI once opened. This is the first
point where the whole system is used exactly the way it'll be used day-to-day.

---

## 7. Recommended order when resuming

1. **First**, decide whether to fold Task 10's real-email gate into the start of
   Session 2 (recommended — see Session 1's parked items above) or knock it out on
   its own first via a Vercel deploy.
2. **Session 2** (accuracy layer) — the highest-value remaining work; the tool is
   not trustworthy without it. Start with `superpowers:brainstorming` (there's one
   real open design question: how/where to store extension heartbeat IPs for
   self-open detection), then `superpowers:writing-plans`, then
   `superpowers:subagent-driven-development` to execute — same process used for
   Session 1, which worked well and caught several real bugs before they shipped.
3. **Session 3** (dashboard) — straightforward once Session 2's data is trustworthy.
4. **Session 4** (extension) — the part the user actually interacts with day-to-day;
   naturally last since everything else needs to exist first for it to have
   something to talk to.

## 8. Process notes for whoever resumes this (probably future-you, Claude)

- This project has been built using Superpowers' brainstorming → writing-plans →
  subagent-driven-development pipeline for each session. That worked well — keep
  using it for Sessions 2–4 rather than switching approaches.
- The user pushes back when things feel over-engineered or scope-creepy (rejected
  multi-account/OAuth, rejected a second database) — stay YAGNI, stay inside the
  spec, and if a real scope question comes up (like Session 2's heartbeat-storage
  design), ask rather than assume.
- The user is impatient with process friction (wanted to skip straight to building
  more than once) but has been receptive when shown *why* a step mattered (e.g. the
  Worker-vs-Next.js tradeoff explanation, the Supabase-vs-D1 latency discussion).
  Brief, concrete tradeoff explanations land better than long ones.
- Git commits so far are fine-grained (one per task, plus fix-round commits) and all
  pushed to `origin/master`. Continue that granularity — it made the final
  whole-branch review's diff easy to reason about task-by-task.
