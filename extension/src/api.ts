import type { ActivityEvent, SentRegistration, ThreadState, TrakkConfig } from "./types";

type BackgroundResponse<T> = { ok: true; data: T } | { ok: false; error: string };

async function requestBackground<T>(message: object): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as BackgroundResponse<T>;
  if (!response?.ok) throw new Error(response?.error ?? "Trakk background worker did not respond.");
  return response.data;
}

export async function registerSentEmail(
  config: TrakkConfig,
  payload: { threadId: string; subject: string; recipientCount: number; links: string[] },
): Promise<SentRegistration> {
  return requestBackground<SentRegistration>({ type: "trakk-register-email", config, payload });
}

export async function getThreadStates(config: TrakkConfig, threadIds: string[]) {
  return requestBackground<{ states: Record<string, ThreadState> }>({ type: "trakk-get-status", config, threadIds });
}

export async function updateEmailThreadId(config: TrakkConfig, emailId: string, threadId: string): Promise<void> {
  await requestBackground<{ ok: true }>({ type: "trakk-update-thread-id", config, emailId, threadId });
}

export async function getRecentActivity(config: TrakkConfig) {
  return requestBackground<{ activity: ActivityEvent[] }>({ type: "trakk-get-activity", config });
}
