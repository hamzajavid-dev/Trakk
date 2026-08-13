import { getThreadStates } from "../api";
import type { ThreadState, TrakkConfig } from "../types";
import { getThreadRows, getSubjectElement, subjectForRow, threadIdForRow } from "./selectors";

const BADGE_CLASS = "trakk-status-badge";

function labelFor(state: ThreadState) {
  if (state.clicks > 0) return "✓✓";
  if (state.opens > 0) return "✓";
  return "";
}
function tooltipFor(state: ThreadState) {
  if (state.opens === 0) return "Trakk: sent and tracked — no confirmed opens yet.";
  const confidence = state.confidence && state.confidence < 85 ? ` (${state.confidence}% confidence)` : "";
  const openPart = `opened ${state.opens} time${state.opens === 1 ? "" : "s"}`;
  const clickPart = state.clicks > 0 ? `; ${state.clicks} link click${state.clicks === 1 ? "" : "s"}` : "; no link clicks yet";
  return `Trakk: ${openPart}${clickPart}${confidence}.`;
}

function paint(row: HTMLElement, state: ThreadState) {
  let badge = row.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  if (!state.tracked) { badge?.remove(); return; }
  const label = labelFor(state);
  if (!label) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    const subjectEl = getSubjectElement(row);
    if (subjectEl?.parentElement) subjectEl.parentElement.insertBefore(badge, subjectEl);
    else row.prepend(badge);
  }
  badge.classList.toggle("trakk-status-badge--clicked", state.clicks > 0);
  badge.textContent = label; badge.title = tooltipFor(state); badge.setAttribute("aria-label", `${subjectForRow(row)}: ${tooltipFor(state)}`);
}

export async function refreshThreadBadges(config: TrakkConfig) {
  const rows = getThreadRows();
  const rowById = new Map(rows.map((row) => [threadIdForRow(row), row] as const).filter((item): item is [string, HTMLElement] => Boolean(item[0])));
  const ids = [...rowById.keys()].slice(0, 100);
  if (!ids.length) return;
  try {
    const { states } = await getThreadStates(config, ids);
    ids.forEach((id) => paint(rowById.get(id)!, states[id] ?? { tracked: false, opens: 0, clicks: 0, firstOpenAt: null, lastOpenAt: null, confidence: null }));
  } catch { /* Gmail stays usable when the dashboard is temporarily unreachable. */ }
}

export function observeThreadRows(config: TrakkConfig) {
  let scheduled = false;
  const refresh = () => { if (scheduled) return; scheduled = true; window.setTimeout(() => { scheduled = false; void refreshThreadBadges(config); }, 500); };
  new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
  refresh();
}
