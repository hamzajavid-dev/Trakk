import type { InboxSDK } from "@inboxsdk/core";
import { getRecentActivity } from "../api";
import type { ActivityEvent, TrakkConfig } from "../types";

// Small brand mark + double-check glyph, inlined as a data URI so the
// toolbar button needs no bundled asset or manifest icon entry.
const TOOLBAR_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
      '<rect width="20" height="20" rx="5" fill="#17211d"/>' +
      '<path d="M2.5 10.5L6 14L11 6" stroke="#b8f86d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M8.5 10.5L12 14L17 6" stroke="#b8f86d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>",
  );

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function renderList(container: HTMLElement, activity: ActivityEvent[]) {
  if (!activity.length) {
    container.innerHTML = '<div class="trakk-activity-empty">No activity yet. It’ll show up here as recipients open or click your tracked emails.</div>';
    return;
  }
  container.innerHTML = activity
    .map((event) => {
      const verb = event.type === "click" ? "Link clicked" : "Email opened";
      const subject = event.subject.replace(/</g, "&lt;");
      return `<div class="trakk-activity-item"><span class="trakk-activity-dot trakk-activity-dot--${event.type}"></span><div class="trakk-activity-body"><strong>${verb}</strong><p>${subject}</p></div><time>${relativeTime(event.at)}</time></div>`;
    })
    .join("");
}

function buildPanel(config: TrakkConfig) {
  const panel = document.createElement("div");
  panel.className = "trakk-activity-panel";
  panel.innerHTML =
    '<div class="trakk-activity-header"><span class="trakk-activity-brand"><i>T</i>trakk</span>' +
    `<a href="${config.appUrl}/dashboard" target="_blank" rel="noreferrer">Open dashboard →</a></div>` +
    '<div class="trakk-activity-list trakk-activity-loading">Loading…</div>';
  return panel;
}

export function registerActivityPanel(sdk: InboxSDK, config: TrakkConfig) {
  sdk.Toolbars.addToolbarButtonForApp({
    title: "Trakk",
    iconUrl: TOOLBAR_ICON,
    onClick: ({ dropdown }) => {
      if (!dropdown) return;
      const panel = buildPanel(config);
      dropdown.el.append(panel);
      const list = panel.querySelector<HTMLElement>(".trakk-activity-list")!;
      void getRecentActivity(config)
        .then(({ activity }) => { renderList(list, activity); dropdown.reposition(); })
        .catch(() => { list.innerHTML = '<div class="trakk-activity-empty">Could not load activity. Check the extension connection.</div>'; dropdown.reposition(); });
    },
  });
}
