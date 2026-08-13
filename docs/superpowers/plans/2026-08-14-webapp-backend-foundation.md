# Webapp Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js webapp's tracking backend — Supabase schema, HMAC-signed
opaque tokens, the `/p/[token]` open-tracking pixel, the `/c/[token]/[i]` click
redirect, and the `POST /api/sent` endpoint that registers an email and returns
tracking URLs — proven end to end with a real email.

**Architecture:** Next.js 15 App Router, Route Handlers only (no pages yet). All DB
access goes through a server-only Supabase client using the service role key. Tokens
are self-verifying HMAC values (`emailId.signature`), so no separate lookup table is
needed to authenticate a pixel/click request — the token itself proves it wasn't
forged. This is Session 1 of the plan in `docs/superpowers/specs/2026-08-14-gmail-tracker-design.md`; the accuracy layer (proxy detection, dedup, confidence scoring) is
explicitly deferred to Session 2, so events here are logged with placeholder-free but
simple defaults (`confidence = 100`, `is_proxy = false`, `is_self = false`) that
Session 2 will compute for real.

**Tech Stack:** Next.js 15 (App Router, TypeScript), @supabase/supabase-js, Node's
built-in `crypto` for HMAC/hashing, Vitest for unit tests.

## Global Constraints

- Files under 200 lines (per spec's working style).
- No mock data committed — code throws if a required env var is unbuilt/missing,
  rather than silently falling back.
- Tokens are HMAC-signed opaque IDs, never sequential (per spec Security section).
- Click redirect must reject any destination that isn't `http`/`https` (no open
  redirect), and must validate against the stored signed `links` row.
- Pixel response headers: `Cache-Control: no-store, no-cache, must-revalidate,
  private`.
- Neither the extension nor a browser talks to Supabase directly — only the Next.js
  server does, via the service role key (per spec Auth section).

---

## File Structure

```
webapp/
  package.json
  tsconfig.json
  next.config.ts
  .env.local.example
  supabase/
    migrations/
      0001_init.sql
  src/
    lib/
      hash.ts            -- sha256 hashing helpers for IP/UA/token digests
      tokens.ts           -- HMAC email-token sign/verify
      linkSig.ts           -- HMAC per-link signature sign/verify
      supabaseAdmin.ts     -- server-only Supabase client (service role)
      pixel.ts             -- the 42-byte transparent GIF buffer + response headers
    app/
      api/
        sent/
          route.ts         -- POST: register email + links, return tracking URLs
      p/
        [token]/
          route.ts         -- GET: log open event, return pixel
      c/
        [token]/
          [i]/
            route.ts       -- GET: validate + log click, redirect
    lib/__tests__/
      hash.test.ts
      tokens.test.ts
      linkSig.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `webapp/package.json`
- Create: `webapp/tsconfig.json`
- Create: `webapp/next.config.ts`
- Create: `webapp/.env.local.example`
- Create: `webapp/.gitignore`
- Create: `webapp/src/app/layout.tsx`
- Create: `webapp/src/app/page.tsx`

**Interfaces:**
- Produces: a running Next.js 15 App Router project at `webapp/`, `npm run dev` boots
  on port 3000, `npm test` runs Vitest.

- [ ] **Step 1: Scaffold the Next.js app**

Run from the repo root:

```bash
npx create-next-app@latest webapp --typescript --app --no-tailwind --no-eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```

When prompted, accept defaults (App Router: yes).

- [ ] **Step 2: Install runtime and test dependencies**

```bash
cd webapp
npm install @supabase/supabase-js
npm install -D vitest
```

- [ ] **Step 3: Add a test script to package.json**

Edit `webapp/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Create the env example file**

Create `webapp/.env.local.example`:

```
# Supabase project settings -> API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Generate with: openssl rand -hex 32
TOKEN_SECRET=
LINK_SIG_SECRET=
EXTENSION_SHARED_SECRET=

# Base URL this app is reachable at (used to build tracking URLs)
APP_BASE_URL=http://localhost:3000
```

- [ ] **Step 5: Copy it to a real local env file**

```bash
cp .env.local.example .env.local
```

Generate real secrets and fill in `.env.local` (not committed — `create-next-app`
already gitignores `.env*.local`):

```bash
openssl rand -hex 32   # run 3x for TOKEN_SECRET, LINK_SIG_SECRET, EXTENSION_SHARED_SECRET
```

Leave `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` blank for now — filled in Task 2.

- [ ] **Step 6: Verify the app boots**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no errors. Stop it with
Ctrl+C.

- [ ] **Step 7: Commit**

```bash
cd ..
git add webapp
git commit -m "Scaffold Next.js webapp"
```

---

### Task 2: Supabase schema

**Files:**
- Create: `webapp/supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: `emails`, `links`, `events` tables in Supabase matching the spec's Data
  Model section, plus the `events(email_id, at)` index. Later tasks assume these exact
  column names and types.

- [ ] **Step 1: Write the migration SQL**

Create `webapp/supabase/migrations/0001_init.sql`:

```sql
create table emails (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  thread_id text not null,
  subject text not null,
  recipient_count integer not null default 1,
  sent_at timestamptz not null default now(),
  tracking_enabled boolean not null default true
);

create table links (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  idx integer not null,
  url text not null,
  sig text not null,
  unique (email_id, idx)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  link_id uuid references links(id) on delete cascade,
  type text not null check (type in ('prefetch', 'open', 'click')),
  at timestamptz not null default now(),
  ip_hash text not null,
  ua_hash text not null,
  is_proxy boolean not null default false,
  is_self boolean not null default false,
  confidence integer not null default 100
);

create index events_email_id_at_idx on events (email_id, at);

alter table emails enable row level security;
alter table links enable row level security;
alter table events enable row level security;
```

Row Level Security is enabled with no policies defined, which means: no access at all
via the anon/public key. Only the service role key (used server-side, which bypasses
RLS) can read/write. This matches the spec's Auth section — the extension and browser
never talk to Supabase directly.

- [ ] **Step 2: Run the migration in Supabase**

In the Supabase dashboard for your project: SQL Editor → paste the contents of
`0001_init.sql` → Run.

Expected: three tables (`emails`, `links`, `events`) appear under Table Editor.

- [ ] **Step 3: Fill in Supabase env vars**

In `webapp/.env.local`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your
Supabase project's Settings → API page (use the `service_role` secret key, not the
anon key).

- [ ] **Step 4: Commit**

```bash
git add webapp/supabase
git commit -m "Add Supabase schema migration"
```

---

### Task 3: Hashing helpers

**Files:**
- Create: `webapp/src/lib/hash.ts`
- Test: `webapp/src/lib/__tests__/hash.test.ts`

**Interfaces:**
- Produces: `sha256Hex(input: string): string`, `hashWithSecret(input: string, secret: string): string`
  — both used by `tokens.ts`, `linkSig.ts`, and the route handlers (for `ip_hash`/`ua_hash`).

- [ ] **Step 1: Write the failing test**

Create `webapp/src/lib/__tests__/hash.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { hashWithSecret, sha256Hex } from "../hash";

describe("sha256Hex", () => {
  it("produces a deterministic 64-char hex digest", () => {
    const digest = sha256Hex("hello");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(sha256Hex("hello"));
  });

  it("produces different digests for different input", () => {
    expect(sha256Hex("hello")).not.toBe(sha256Hex("world"));
  });
});

describe("hashWithSecret", () => {
  it("produces different output for different secrets", () => {
    const a = hashWithSecret("payload", "secret-a");
    const b = hashWithSecret("payload", "secret-b");
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same input and secret", () => {
    expect(hashWithSecret("payload", "secret")).toBe(
      hashWithSecret("payload", "secret"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npm test -- hash.test.ts`
Expected: FAIL — `Cannot find module '../hash'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/lib/hash.ts`:

```typescript
import { createHash, createHmac } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashWithSecret(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hash.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/hash.ts webapp/src/lib/__tests__/hash.test.ts
git commit -m "Add sha256/HMAC hashing helpers"
```

---

### Task 4: Email tokens (HMAC-signed opaque IDs)

**Files:**
- Create: `webapp/src/lib/tokens.ts`
- Test: `webapp/src/lib/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: `hashWithSecret` from `hash.ts` (Task 3).
- Produces: `createEmailToken(emailId: string, secret: string): string` and
  `verifyEmailToken(token: string, secret: string): string | null` (returns the
  `emailId` if valid, `null` if forged/malformed/tampered). Used by `/api/sent`,
  `/p/[token]`, `/c/[token]/[i]`.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/lib/__tests__/tokens.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createEmailToken, verifyEmailToken } from "../tokens";

const SECRET = "test-secret";
const EMAIL_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("createEmailToken / verifyEmailToken", () => {
  it("round-trips a valid token back to the email id", () => {
    const token = createEmailToken(EMAIL_ID, SECRET);
    expect(verifyEmailToken(token, SECRET)).toBe(EMAIL_ID);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createEmailToken(EMAIL_ID, "other-secret");
    expect(verifyEmailToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered emailId with a still-valid-looking signature", () => {
    const token = createEmailToken(EMAIL_ID, SECRET);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("11111111-1111-1111-1111-111111111111").toString("base64url")}.${sig}`;
    expect(verifyEmailToken(forged, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyEmailToken("not-a-token", SECRET)).toBeNull();
    expect(verifyEmailToken("", SECRET)).toBeNull();
  });

  it("does not produce sequential/guessable tokens for sequential ids", () => {
    const t1 = createEmailToken("00000000-0000-0000-0000-000000000001", SECRET);
    const t2 = createEmailToken("00000000-0000-0000-0000-000000000002", SECRET);
    const [, sig1] = t1.split(".");
    const [, sig2] = t2.split(".");
    expect(sig1).not.toBe(sig2);
    expect(sig1.slice(0, 10)).not.toBe(sig2.slice(0, 10));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tokens.test.ts`
Expected: FAIL — `Cannot find module '../tokens'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/lib/tokens.ts`:

```typescript
import { timingSafeEqual } from "crypto";
import { hashWithSecret } from "./hash";

export function createEmailToken(emailId: string, secret: string): string {
  const idPart = Buffer.from(emailId, "utf8").toString("base64url");
  const sig = hashWithSecret(emailId, secret);
  return `${idPart}.${sig}`;
}

export function verifyEmailToken(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [idPart, sig] = parts;

  let emailId: string;
  try {
    emailId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = hashWithSecret(emailId, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return emailId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tokens.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/tokens.ts webapp/src/lib/__tests__/tokens.test.ts
git commit -m "Add HMAC-signed opaque email tokens"
```

---

### Task 5: Link signatures

**Files:**
- Create: `webapp/src/lib/linkSig.ts`
- Test: `webapp/src/lib/__tests__/linkSig.test.ts`

**Interfaces:**
- Consumes: `hashWithSecret` from `hash.ts` (Task 3).
- Produces: `signLink(emailId: string, idx: number, url: string, secret: string): string`
  and `verifyLinkSig(emailId: string, idx: number, url: string, sig: string, secret: string): boolean`,
  plus `isSafeRedirectUrl(url: string): boolean`. Used by `/api/sent` (to compute
  `sig` when storing a link row) and `/c/[token]/[i]` (to verify before redirecting).

- [ ] **Step 1: Write the failing test**

Create `webapp/src/lib/__tests__/linkSig.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isSafeRedirectUrl, signLink, verifyLinkSig } from "../linkSig";

const SECRET = "test-secret";
const EMAIL_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("signLink / verifyLinkSig", () => {
  it("verifies a signature it produced", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(verifyLinkSig(EMAIL_ID, 0, "https://example.com", sig, SECRET)).toBe(true);
  });

  it("rejects if the url was swapped after signing", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(verifyLinkSig(EMAIL_ID, 0, "https://evil.com", sig, SECRET)).toBe(false);
  });

  it("rejects if the idx was swapped after signing", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(verifyLinkSig(EMAIL_ID, 1, "https://example.com", sig, SECRET)).toBe(false);
  });

  it("rejects a signature from a different email", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(
      verifyLinkSig("00000000-0000-0000-0000-000000000099", 0, "https://example.com", sig, SECRET),
    ).toBe(false);
  });
});

describe("isSafeRedirectUrl", () => {
  it("allows http and https", () => {
    expect(isSafeRedirectUrl("https://example.com")).toBe(true);
    expect(isSafeRedirectUrl("http://example.com/path?q=1")).toBe(true);
  });

  it("rejects javascript: and other schemes", () => {
    expect(isSafeRedirectUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectUrl("data:text/html,hi")).toBe(false);
    expect(isSafeRedirectUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed urls", () => {
    expect(isSafeRedirectUrl("not a url")).toBe(false);
    expect(isSafeRedirectUrl("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- linkSig.test.ts`
Expected: FAIL — `Cannot find module '../linkSig'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/lib/linkSig.ts`:

```typescript
import { timingSafeEqual } from "crypto";
import { hashWithSecret } from "./hash";

function payload(emailId: string, idx: number, url: string): string {
  return `${emailId}:${idx}:${url}`;
}

export function signLink(
  emailId: string,
  idx: number,
  url: string,
  secret: string,
): string {
  return hashWithSecret(payload(emailId, idx, url), secret);
}

export function verifyLinkSig(
  emailId: string,
  idx: number,
  url: string,
  sig: string,
  secret: string,
): boolean {
  const expected = signLink(emailId, idx, url, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

export function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- linkSig.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/linkSig.ts webapp/src/lib/__tests__/linkSig.test.ts
git commit -m "Add per-link HMAC signatures and redirect URL validation"
```

---

### Task 6: Supabase server client and pixel constant

**Files:**
- Create: `webapp/src/lib/supabaseAdmin.ts`
- Create: `webapp/src/lib/pixel.ts`

**Interfaces:**
- Produces: `getSupabaseAdmin(): SupabaseClient` (throws if env vars are missing —
  no silent fallback) and `PIXEL_GIF: Buffer` + `PIXEL_HEADERS: Record<string, string>`.
  Used by all three route handlers.

- [ ] **Step 1: Write the Supabase admin client**

Create `webapp/src/lib/supabaseAdmin.ts`:

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (server-only, never expose to the client)",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
```

- [ ] **Step 2: Write the pixel constant**

Create `webapp/src/lib/pixel.ts`:

```typescript
// 1x1 transparent GIF, 43 bytes.
export const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64",
);

export const PIXEL_HEADERS: Record<string, string> = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};
```

- [ ] **Step 3: Verify the GIF decodes correctly**

Run in the `webapp` directory:

```bash
node -e "console.log(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7','base64').length)"
```

Expected: `43`

- [ ] **Step 4: Commit**

```bash
git add webapp/src/lib/supabaseAdmin.ts webapp/src/lib/pixel.ts
git commit -m "Add Supabase admin client and tracking pixel constant"
```

---

### Task 7: `POST /api/sent` — register an email

**Files:**
- Create: `webapp/src/app/api/sent/route.ts`

**Interfaces:**
- Consumes: `createEmailToken` (Task 4), `signLink`, `isSafeRedirectUrl` (Task 5),
  `getSupabaseAdmin` (Task 6).
- Produces: the HTTP contract later consumed by the extension (Session 4) —
  `POST /api/sent` with header `Authorization: Bearer <EXTENSION_SHARED_SECRET>` and
  JSON body `{ threadId: string, subject: string, recipientCount: number, links: string[] }`,
  responding `201` with
  `{ emailId: string, pixelUrl: string, links: { idx: number, url: string, trackingUrl: string }[] }`.

- [ ] **Step 1: Write the route handler**

Create `webapp/src/app/api/sent/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createEmailToken } from "@/lib/tokens";
import { isSafeRedirectUrl, signLink } from "@/lib/linkSig";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

interface SentBody {
  threadId: string;
  subject: string;
  recipientCount: number;
  links: string[];
}

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.EXTENSION_SHARED_SECRET}`;
  return header === expected;
}

export async function POST(req: NextRequest) {
  if (!process.env.EXTENSION_SHARED_SECRET) {
    throw new Error("EXTENSION_SHARED_SECRET must be set");
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as SentBody;
  if (!body.threadId || !body.subject || !Array.isArray(body.links)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const badLink = body.links.find((url) => !isSafeRedirectUrl(url));
  if (badLink) {
    return NextResponse.json(
      { error: `unsafe link url: ${badLink}` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .insert({
      token_hash: "pending",
      thread_id: body.threadId,
      subject: body.subject,
      recipient_count: body.recipientCount ?? 1,
    })
    .select()
    .single();
  if (emailError || !email) {
    return NextResponse.json({ error: emailError?.message }, { status: 500 });
  }

  const tokenSecret = process.env.TOKEN_SECRET!;
  const linkSigSecret = process.env.LINK_SIG_SECRET!;
  const baseUrl = process.env.APP_BASE_URL!;

  const token = createEmailToken(email.id, tokenSecret);
  const { hashWithSecret } = await import("@/lib/hash");
  const tokenHash = hashWithSecret(token, tokenSecret);

  await supabase.from("emails").update({ token_hash: tokenHash }).eq("id", email.id);

  const linkRows = body.links.map((url, idx) => ({
    email_id: email.id,
    idx,
    url,
    sig: signLink(email.id, idx, url, linkSigSecret),
  }));

  if (linkRows.length > 0) {
    const { error: linksError } = await supabase.from("links").insert(linkRows);
    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      emailId: email.id,
      pixelUrl: `${baseUrl}/p/${token}`,
      links: linkRows.map((row) => ({
        idx: row.idx,
        url: row.url,
        trackingUrl: `${baseUrl}/c/${token}/${row.idx}`,
      })),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Manual verification**

Start the dev server (`npm run dev` in `webapp/`), then in another terminal:

```bash
curl -s -X POST http://localhost:3000/api/sent \
  -H "Authorization: Bearer $(grep EXTENSION_SHARED_SECRET webapp/.env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"t1","subject":"Test","recipientCount":1,"links":["https://example.com"]}' \
  | python3 -m json.tool
```

Expected: `201`-shaped JSON with `emailId`, `pixelUrl` (starting
`http://localhost:3000/p/`), and one entry in `links` with a `trackingUrl`.

Also verify unauthorized requests are rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/sent \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `401`

- [ ] **Step 3: Commit**

```bash
git add webapp/src/app/api/sent
git commit -m "Add POST /api/sent to register emails and issue tracking URLs"
```

---

### Task 8: `GET /p/[token]` — open-tracking pixel

**Files:**
- Create: `webapp/src/app/p/[token]/route.ts`

**Interfaces:**
- Consumes: `verifyEmailToken` (Task 4), `sha256Hex` (Task 3), `getSupabaseAdmin`,
  `PIXEL_GIF`/`PIXEL_HEADERS` (Task 6).
- Produces: `GET /p/:token` — always returns the pixel GIF (even on an invalid token,
  so probing doesn't get a different response shape), logging an `events` row with
  `type = 'open'` only when the token is valid.

- [ ] **Step 1: Write the route handler**

Create `webapp/src/app/p/[token]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/tokens";
import { sha256Hex } from "@/lib/hash";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PIXEL_GIF, PIXEL_HEADERS } from "@/lib/pixel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tokenSecret = process.env.TOKEN_SECRET!;
  const emailId = verifyEmailToken(token, tokenSecret);

  if (emailId) {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    const supabase = getSupabaseAdmin();
    await supabase.from("events").insert({
      email_id: emailId,
      type: "open",
      ip_hash: sha256Hex(ip),
      ua_hash: sha256Hex(ua),
    });
  }

  return new NextResponse(new Uint8Array(PIXEL_GIF), { headers: PIXEL_HEADERS });
}
```

- [ ] **Step 2: Manual verification**

Using the `pixelUrl` returned from Task 7's curl call:

```bash
curl -s -o /tmp/pixel.gif -D - http://localhost:3000/p/<token-from-step-above>
```

Expected: `200`, `Content-Type: image/gif`, `Cache-Control: no-store, no-cache,
must-revalidate, private`, and `/tmp/pixel.gif` is 43 bytes
(`wc -c /tmp/pixel.gif` on macOS/Linux, or read the `Content-Length` header on
Windows).

Then check Supabase (Table Editor → `events`, or SQL Editor:
`select * from events order by at desc limit 5;`) — a row with `type = 'open'` for
that `email_id` should be present.

Also verify a garbage token doesn't error and doesn't log:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/p/not-a-real-token
```

Expected: `200`, and no new row in `events`.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/app/p
git commit -m "Add GET /p/[token] open-tracking pixel endpoint"
```

---

### Task 9: `GET /c/[token]/[i]` — click redirect

**Files:**
- Create: `webapp/src/app/c/[token]/[i]/route.ts`

**Interfaces:**
- Consumes: `verifyEmailToken` (Task 4), `verifyLinkSig`, `isSafeRedirectUrl` (Task 5),
  `sha256Hex` (Task 3), `getSupabaseAdmin` (Task 6).
- Produces: `GET /c/:token/:i` — 302 redirect to the original URL on success; 404 if
  the token is invalid, `i` isn't a known link index for that email, or the stored
  signature doesn't match (defense in depth against a tampered `links` row).

- [ ] **Step 1: Write the route handler**

Create `webapp/src/app/c/[token]/[i]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/tokens";
import { isSafeRedirectUrl, verifyLinkSig } from "@/lib/linkSig";
import { sha256Hex } from "@/lib/hash";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; i: string }> },
) {
  const { token, i } = await params;
  const tokenSecret = process.env.TOKEN_SECRET!;
  const linkSigSecret = process.env.LINK_SIG_SECRET!;

  const emailId = verifyEmailToken(token, tokenSecret);
  const idx = Number.parseInt(i, 10);
  if (!emailId || Number.isNaN(idx)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data: link } = await supabase
    .from("links")
    .select("id, url, sig")
    .eq("email_id", emailId)
    .eq("idx", idx)
    .single();

  if (!link) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!verifyLinkSig(emailId, idx, link.url, link.sig, linkSigSecret)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!isSafeRedirectUrl(link.url)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  await supabase.from("events").insert({
    email_id: emailId,
    link_id: link.id,
    type: "click",
    ip_hash: sha256Hex(ip),
    ua_hash: sha256Hex(ua),
  });

  return NextResponse.redirect(link.url, { status: 302 });
}
```

- [ ] **Step 2: Manual verification**

Using the `trackingUrl` returned from Task 7's curl call:

```bash
curl -s -o /dev/null -D - http://localhost:3000/c/<token>/0
```

Expected: `302` with `Location: https://example.com`.

Check Supabase `events` table — a row with `type = 'click'` and a non-null `link_id`
should be present.

Verify an unknown link index 404s:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/c/<token>/99
```

Expected: `404`

- [ ] **Step 3: Commit**

```bash
git add webapp/src/app/c
git commit -m "Add GET /c/[token]/[i] click-tracking redirect endpoint"
```

---

### Task 10: Session 1 gate — real email round trip

**Files:** none (manual verification task)

- [ ] **Step 1: Deploy or tunnel the dev server so a real mail client can reach it**

Either run `npx vercel dev` / deploy to Vercel with the env vars from `.env.local` set
as project env vars, or use a tunnel (e.g. `npx untun@latest tunnel http://localhost:3000`)
so `APP_BASE_URL` is a real public HTTPS URL. Update `APP_BASE_URL` in `.env.local`
(and redeploy/restart) to match.

- [ ] **Step 2: Register a test email via curl**

```bash
curl -s -X POST $APP_BASE_URL/api/sent \
  -H "Authorization: Bearer $EXTENSION_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"gate-test","subject":"Gate test","recipientCount":1,"links":["https://example.com"]}'
```

Note the `pixelUrl` and the `trackingUrl` from the response.

- [ ] **Step 3: Send yourself a real email containing both**

Compose a plain HTML test email (any method — a local `.html` file with
`<img src="PIXEL_URL"><a href="TRACKING_URL">click me</a>` opened in a browser and
its source copy-pasted into Gmail's compose via "Insert code snippet"/paste-as-HTML
workaround, or any quick script using an SMTP library you already have available) to
an email address you control, and send it through Gmail normally.

- [ ] **Step 4: Open the email and click the link**

From the receiving mailbox, open the email and click the test link.

- [ ] **Step 5: Verify in Supabase**

Run in Supabase SQL Editor:

```sql
select type, at, ip_hash, ua_hash from events
where email_id = '<emailId from step 2>'
order by at;
```

Expected: at least one `open` row (Gmail's own prefetch will likely also show up as an
`open` row here — that's expected and correct for Session 1; Session 2 adds the logic
to reclassify prefetches) and one `click` row.

**Gate passed when:** a real, unmodified Gmail-sent email produces real rows in
`events` — this confirms the whole chain (compose → send → recipient's mail client →
pixel/click endpoints → Supabase) works before any accuracy or UI work begins.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 2), tokens/security (Tasks 4-5, 9), pixel
  endpoint + cache headers (Task 8), click redirect + open-redirect protection (Task
  9), `/api/sent` contract for the future extension (Task 7), RLS/server-only Supabase
  access (Tasks 2, 6) are all covered. Accuracy layer (proxy detection, dedup,
  confidence) and dashboard/extension are intentionally out of scope for this plan —
  they are Sessions 2-4 in the spec and get their own plans after this gate passes.
- **Placeholder scan:** no TBD/TODO; the one default-value shortcut (`confidence =
  100`, `is_proxy/is_self = false` as column defaults) is called out explicitly as
  deferred to Session 2, not left ambiguous.
- **Type consistency:** `createEmailToken`/`verifyEmailToken` signatures match across
  Tasks 4, 7, 8, 9. `signLink`/`verifyLinkSig` signatures match across Tasks 5, 7, 9.
  `getSupabaseAdmin()` return type used consistently.
