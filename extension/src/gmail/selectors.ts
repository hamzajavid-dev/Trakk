/** Gmail DOM selectors live here so Gmail UI changes have one repair point. */

const THREAD_ROW = "tr[role='main'] tr, [role='main'] [data-thread-id]"; // Rows in Gmail's conversation list.
const THREAD_SUBJECT = "[data-thread-id] span, .bog"; // Best-effort subject text inside a conversation row.
const COMPOSE_TOOLBAR = ".aDh, [role='toolbar']"; // Formatting/action toolbar inside an active compose window.
const COMPOSE_BODY = "[aria-label='Message Body']"; // Gmail editable message body.

export function getThreadRows(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(THREAD_ROW)].filter((row) => Boolean(threadIdForRow(row)));
}

export function threadIdForRow(row: HTMLElement): string | null {
  return row.dataset.threadId ?? row.getAttribute("data-legacy-thread-id") ?? null;
}

export function subjectForRow(row: HTMLElement): string {
  return row.querySelector<HTMLElement>(THREAD_SUBJECT)?.innerText.trim() ?? "Tracked email";
}

export function findComposeToolbar(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(COMPOSE_TOOLBAR);
}

export function findComposeBody(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(COMPOSE_BODY);
}
