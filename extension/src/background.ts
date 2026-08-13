import "@inboxsdk/core/background";
import { getConfig, type SentRegistration, type ThreadState, type TrakkConfig } from "./types";

const HEARTBEAT_ALARM = "trakk-heartbeat";
const SELF_OPEN_RULES = [9101, 9102];

async function refreshSelfOpenRules() {
  const config = await getConfig();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: SELF_OPEN_RULES, addRules: config ? rulesFor(config.appUrl) : [] });
}

function rulesFor(appUrl: string): chrome.declarativeNetRequest.Rule[] {
  const host = new URL(appUrl).hostname;
  const noopUrl = `${appUrl}/api/noop`;
  return [
    { id: 9101, priority: 2, action: { type: "redirect", redirect: { url: noopUrl } }, condition: { urlFilter: `||${host}/p/`, resourceTypes: ["image"], initiatorDomains: ["mail.google.com"] } },
    { id: 9102, priority: 1, action: { type: "redirect", redirect: { url: noopUrl } }, condition: { urlFilter: "||googleusercontent.com/proxy/", resourceTypes: ["image"], initiatorDomains: ["mail.google.com"] } },
  ];
}

async function heartbeat() {
  const config = await getConfig();
  if (!config) return;
  try { await sendHeartbeat(config); } catch { /* A network retry at the next alarm is enough. */ }
}

function authorization(config: TrakkConfig) { return { Authorization: `Bearer ${config.extensionSecret}` }; }

async function responseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) throw new Error(`${label} failed (${response.status}).`);
  return response.json() as Promise<T>;
}

async function registerEmail(config: TrakkConfig, payload: { threadId: string; subject: string; recipientCount: number; links: string[] }) {
  const response = await fetch(`${config.appUrl}/api/sent`, { method: "POST", headers: { ...authorization(config), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return responseJson<SentRegistration>(response, "Email registration");
}

async function getStatus(config: TrakkConfig, threadIds: string[]) {
  const response = await fetch(`${config.appUrl}/api/status?threadIds=${encodeURIComponent(threadIds.join(","))}`, { headers: authorization(config) });
  return responseJson<{ states: Record<string, ThreadState> }>(response, "Status lookup");
}

async function sendHeartbeat(config: TrakkConfig) {
  const response = await fetch(`${config.appUrl}/api/heartbeat`, { method: "POST", headers: authorization(config) });
  if (!response.ok) throw new Error(`Heartbeat failed (${response.status}).`);
}

async function updateThreadId(config: TrakkConfig, emailId: string, threadId: string) {
  const response = await fetch(`${config.appUrl}/api/sent/${emailId}`, { method: "PATCH", headers: { ...authorization(config), "Content-Type": "application/json" }, body: JSON.stringify({ threadId }) });
  return responseJson<{ ok: true }>(response, "Thread ID update");
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  const request = message as { type: string; config?: TrakkConfig; payload?: { threadId: string; subject: string; recipientCount: number; links: string[] }; threadIds?: string[]; emailId?: string; threadId?: string };
  const task = request.type === "trakk-register-email" && request.config && request.payload
    ? registerEmail(request.config, request.payload)
    : request.type === "trakk-get-status" && request.config && request.threadIds
      ? getStatus(request.config, request.threadIds)
      : request.type === "trakk-update-thread-id" && request.config && request.emailId && request.threadId
        ? updateThreadId(request.config, request.emailId, request.threadId)
        : null;
  if (!task) return;
  void task.then((data) => sendResponse({ ok: true, data })).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : "Trakk request failed.";
    console.error("[Trakk] Background request failed", error);
    sendResponse({ ok: false, error: text });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 30 });
  await refreshSelfOpenRules();
  await heartbeat();
});
chrome.runtime.onStartup.addListener(async () => { await refreshSelfOpenRules(); await heartbeat(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === HEARTBEAT_ALARM) void heartbeat(); });
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") void refreshSelfOpenRules(); });
