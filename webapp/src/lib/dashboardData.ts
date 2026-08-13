import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type EventType = "prefetch" | "open" | "click";

export interface DashboardEvent {
  id: string;
  email_id: string;
  link_id: string | null;
  type: EventType;
  at: string;
  confidence: number;
  is_proxy: boolean;
  is_self: boolean;
}

export interface TrackedEmail {
  id: string;
  thread_id: string;
  subject: string;
  recipient_count: number;
  sent_at: string;
  tracking_enabled: boolean;
}

export interface TrackedLink {
  id: string;
  email_id: string;
  idx: number;
  url: string;
}

export interface EmailSummary extends TrackedEmail {
  opens: number;
  clicks: number;
  latestActivity: string | null;
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
      return {
        ...email,
        opens: emailEvents.filter((event) => event.type === "open").length,
        clicks: emailEvents.filter((event) => event.type === "click").length,
        latestActivity: activityAt(emailEvents),
      };
    })
    .sort((a, b) => (b.latestActivity ?? b.sent_at).localeCompare(a.latestActivity ?? a.sent_at));
}

export async function getDashboardSnapshot() {
  const supabase = getSupabaseAdmin();
  const [{ data: emails, error: emailsError }, { data: events, error: eventsError }, { data: links, error: linksError }] =
    await Promise.all([
      supabase.from("emails").select("id, thread_id, subject, recipient_count, sent_at, tracking_enabled").order("sent_at", { ascending: false }),
      supabase.from("events").select("id, email_id, link_id, type, at, confidence, is_proxy, is_self").order("at", { ascending: false }),
      supabase.from("links").select("id, email_id, idx, url").order("idx", { ascending: true }),
    ]);

  if (emailsError || eventsError || linksError) {
    throw new Error(emailsError?.message ?? eventsError?.message ?? linksError?.message);
  }

  return {
    emails: (emails ?? []) as TrackedEmail[],
    events: (events ?? []) as DashboardEvent[],
    links: (links ?? []) as TrackedLink[],
  };
}

export async function getEmailDetail(id: string) {
  const snapshot = await getDashboardSnapshot();
  const email = snapshot.emails.find((item) => item.id === id);
  if (!email) return null;

  return {
    email,
    events: snapshot.events.filter((event) => event.email_id === id),
    links: snapshot.links.filter((link) => link.email_id === id),
  };
}
