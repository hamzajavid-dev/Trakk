/** Gmail DOM selectors live here so Gmail UI changes have one repair point. */

const THREAD_ROW = "tr.zA"; // Each conversation row in Gmail's message list views (Sent, Inbox, etc).
const THREAD_ID_ATTR = "[data-legacy-thread-id]"; // Nested element carrying the real Gmail thread ID as a plain hex string (matches what the backend stores).
const RECIPIENT_CELL = ".yW"; // Visible "To: <name>" text in Sent/Drafts row views — where the badge is anchored, matching the reference UI (checkmark before the recipient).
const SUBJECT_SPAN = ".bog"; // Subject text span; fallback anchor when a row has no recipient cell (e.g. Inbox rows), and used for display text.
const COMPOSE_TOOLBAR = ".aDh, [role='toolbar']"; // Formatting/action toolbar inside an active compose window.
const COMPOSE_BODY = "[aria-label='Message Body']"; // Gmail editable message body.
const SENT_NAV_LINK = "a[href*='#sent']"; // Left-sidebar "Sent" folder link — matched by its stable route hash, not a styling class.
const SCHEDULED_NAV_LINK = "a[href*='#scheduled']"; // Left-sidebar "Scheduled" link — Gmail only renders this item at all when at least one send is queued.

export function getThreadRows(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(THREAD_ROW)].filter((row) => Boolean(threadIdForRow(row)));
}

export function threadIdForRow(row: HTMLElement): string | null {
  return row.querySelector<HTMLElement>(THREAD_ID_ATTR)?.getAttribute("data-legacy-thread-id") ?? null;
}

export function getSubjectElement(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>(RECIPIENT_CELL) ?? row.querySelector<HTMLElement>(SUBJECT_SPAN);
}

export function subjectForRow(row: HTMLElement): string {
  return row.querySelector<HTMLElement>(SUBJECT_SPAN)?.textContent?.trim() ?? "Tracked email";
}

export function findComposeToolbar(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(COMPOSE_TOOLBAR);
}

export function findComposeBody(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(COMPOSE_BODY);
}

export function findSentNavLink(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(SENT_NAV_LINK);
}

export function findScheduledNavLink(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(SCHEDULED_NAV_LINK);
}
