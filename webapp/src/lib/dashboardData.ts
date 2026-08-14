import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export * from "./eventFilters";
import type { DashboardEvent, TrackedEmail } from "./eventFilters";

export interface TrackedLink {
  id: string;
  email_id: string;
  idx: number;
  url: string;
}

export async function getDashboardSnapshot() {
  const supabase = getSupabaseAdmin();
  const [{ data: emails, error: emailsError }, { data: events, error: eventsError }, { data: links, error: linksError }] =
    await Promise.all([
      supabase.from("emails").select("id, thread_id, subject, recipient_count, sent_at, tracking_enabled").order("sent_at", { ascending: false }),
      supabase.from("events").select("id, email_id, link_id, type, at, confidence, is_proxy, is_self, client").order("at", { ascending: false }),
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
