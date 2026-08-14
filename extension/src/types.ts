export type TrakkConfig = { appUrl: string; extensionSecret: string; inboxSdkAppId: string };

export type ThreadState = {
  tracked: boolean;
  opens: number;
  clicks: number;
  firstOpenAt: string | null;
  lastOpenAt: string | null;
  confidence: number | null;
};

export type SentRegistration = {
  emailId: string;
  pixelUrl: string;
  links: Array<{ idx: number; url: string; trackingUrl: string }>;
};

export type ActivityEvent = {
  id: string;
  emailId: string;
  type: "open" | "click";
  subject: string;
  at: string;
  confidence: number;
};

export function cleanAppUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export async function getConfig(): Promise<TrakkConfig | null> {
  const stored = await chrome.storage.local.get(["appUrl", "extensionSecret", "inboxSdkAppId"]);
  const appUrl = typeof stored.appUrl === "string" ? cleanAppUrl(stored.appUrl) : "";
  const extensionSecret = typeof stored.extensionSecret === "string" ? stored.extensionSecret.trim() : "";
  const inboxSdkAppId = typeof stored.inboxSdkAppId === "string" ? stored.inboxSdkAppId.trim() : "";
  return appUrl && extensionSecret && inboxSdkAppId ? { appUrl, extensionSecret, inboxSdkAppId } : null;
}
