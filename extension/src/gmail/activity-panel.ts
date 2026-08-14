import type { InboxSDK } from "@inboxsdk/core";
import { getRecentActivity } from "../api";
import type { ActivityEvent, TrakkConfig } from "../types";
import { findScheduledNavLink } from "./selectors";

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

// Trakk doesn't run its own scheduler — Gmail's native "Schedule send" already
// works with Trakk's tracking (the presend hook fires at actual transmit
// time, scheduled or not). This just surfaces the count Gmail itself already
// renders next to its "Scheduled" nav item, with a link into Gmail's own list,
// rather than duplicating that fragile detail ourselves.
function scheduledSummaryHtml(): string {
  const link = findScheduledNavLink();
  if (!link) return "";
  const count = link.textContent?.match(/(\d+)\s*$/)?.[1];
  const label = count ? `${count} email${count === "1" ? "" : "s"} scheduled` : "You have emails scheduled";
  const scheduledUrl = `${location.origin}${location.pathname}#scheduled`;
  return `<a class="trakk-scheduled-row" href="${scheduledUrl}"><span class="trakk-scheduled-dot"></span><span>${label}</span><span class="trakk-scheduled-arrow">→</span></a>`;
}

function buildPanel(config: TrakkConfig) {
  const panel = document.createElement("div");
  panel.className = "trakk-activity-panel";
  const markUrl = chrome.runtime.getURL("icons/icon128.png");
  panel.innerHTML =
    `<div class="trakk-activity-header"><span class="trakk-activity-brand"><img src="${markUrl}" alt="" />trakk</span>` +
    `<a href="${config.appUrl}/dashboard" target="_blank" rel="noreferrer">Open dashboard →</a></div>` +
    scheduledSummaryHtml() +
    '<div class="trakk-activity-list trakk-activity-loading">Loading…</div>';
  return panel;
}

export function registerActivityPanel(sdk: InboxSDK, config: TrakkConfig) {
  sdk.Toolbars.addToolbarButtonForApp({
    title: "Trakk",
    iconUrl: chrome.runtime.getURL("icons/icon32.png"),
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
