export type EventType = "prefetch" | "open" | "click";
export type ClientType = "desktop" | "mobile" | "proxy" | "unknown";

export interface DashboardEvent {
  id: string;
  email_id: string;
  link_id: string | null;
  type: EventType;
  at: string;
  confidence: number;
  is_proxy: boolean;
  is_self: boolean;
  client: ClientType;
}

export interface TrackedEmail {
  id: string;
  thread_id: string;
  subject: string;
  recipient_count: number;
  sent_at: string;
  tracking_enabled: boolean;
}

export interface EmailSummary extends TrackedEmail {
  opens: number;
  clicks: number;
  latestActivity: string | null;
  lastOpenAt: string | null;
}

// A self-open (the sender viewing their own sent mail) or a low-confidence
// proxy render is real traffic, but it isn't a confirmed recipient signal —
// every place that counts "opens"/"clicks" for display must exclude these,
// or a sender testing their own email reads as if a recipient engaged.
export function isConfirmedOpen(event: DashboardEvent): boolean {
  return event.type === "open" && !event.is_self && event.confidence >= 60;
}
export function isConfirmedClick(event: DashboardEvent): boolean {
  return event.type === "click" && !event.is_self;
}

function activityAt(events: DashboardEvent[]) {
  return events.reduce<string | null>((latest, event) => {
    if (!latest || event.at > latest) return event.at;
    return latest;
  }, null);
}

export function summariseEmails(emails: TrackedEmail[], events: DashboardEvent[]): EmailSummary[] {
  const eventsByEmail = new Map<string, DashboardEvent[]>();
  for (const event of events) {
    const group = eventsByEmail.get(event.email_id) ?? [];
    group.push(event);
    eventsByEmail.set(event.email_id, group);
  }

  return emails
    .map((email) => {
      const emailEvents = eventsByEmail.get(email.id) ?? [];
      const confirmedOpens = emailEvents.filter(isConfirmedOpen);
      const confirmedClicks = emailEvents.filter(isConfirmedClick);
      return {
        ...email,
        opens: confirmedOpens.length,
        clicks: confirmedClicks.length,
        latestActivity: activityAt([...confirmedOpens, ...confirmedClicks]),
        lastOpenAt: activityAt(confirmedOpens),
      };
    })
    .sort((a, b) => (b.latestActivity ?? b.sent_at).localeCompare(a.latestActivity ?? a.sent_at));
}
