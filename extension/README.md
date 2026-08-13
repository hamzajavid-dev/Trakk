# Trakk Chrome extension

The private, unpacked Chrome extension that connects Gmail to the Trakk webapp. It
never talks directly to Supabase: it uses the webapp's extension bearer secret for
all tracker traffic.

## Build and load

```bash
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select `extension/dist`.

Open the Trakk extension popup and enter:

- **Web app URL**: the public HTTPS URL for the deployed `webapp` (for example,
  `https://your-trakk.vercel.app`). `http://localhost:3000` is permitted during
  local development.
- **Extension secret**: exactly the `EXTENSION_SHARED_SECRET` value in the webapp's
  gitignored `.env.local` file.
- **InboxSDK app ID**: register a free Chrome extension application at
  [register.inboxsdk.com](https://register.inboxsdk.com/) and paste the ID it issues
  (normally beginning with `sdk_`). InboxSDK will not activate on Gmail without it.

The connection values are stored only in `chrome.storage.local`. Do not commit the
secret or include it in source files.

## What it does

- Uses InboxSDK's `presending` hook, covering Send, Ctrl+Enter, and scheduled send.
  It registers the message with `POST /api/sent`, rewrites HTTP(S) links, then adds
  the one-pixel tracking image.
- Adds a **Track with Trakk** checkbox to each compose; leaving it unchecked means
  no message metadata, links, or pixel are sent to Trakk.
- Watches Gmail's recycled conversation rows with a `MutationObserver`, gets batched
  state from `GET /api/status`, and injects `✓` for tracked messages or `✓✓` after
  confirmed opens. The hover title includes opens, clicks, and confidence context.
- Sends a heartbeat every 30 minutes and redirects self-view pixel requests (and
  Gmail proxy pixel requests) to `/api/noop`, helping prevent the owner's Gmail
  views from being counted as opens.

All Gmail DOM selectors are deliberately contained in `src/gmail/selectors.ts`.
That is the single repair point if Gmail changes its markup.

## Live verification

1. Deploy the webapp over HTTPS and set `APP_BASE_URL` to that exact URL.
2. Apply both Supabase migrations, create the configured owner Auth user, and set
   `SUPABASE_ANON_KEY` plus `DASHBOARD_OWNER_EMAIL` in the webapp environment.
3. Build and load the extension, save its connection in the popup, then reload Gmail.
4. Send a normal email to a separate mailbox with tracking enabled. Confirm `✓` in
   Sent, open it in the recipient mailbox, then confirm `✓✓` and the event in the
   dashboard.
5. Open the sender's Sent copy and confirm it does not create a counted open.

`npm run build` verifies TypeScript and produces the folder Chrome consumes.

## If Gmail looks unchanged

After rebuilding, open `chrome://extensions`, click **Reload** on Trakk for Gmail,
then hard-refresh Gmail with `Ctrl+Shift+R` before opening a new Compose window. The
extension requires its generated `pageWorld.js` file and Chrome's `scripting`
permission for InboxSDK; both are included by the current build.
