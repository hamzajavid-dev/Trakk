import { NextRequest, NextResponse } from "next/server";
import { isExtensionAuthorized } from "@/lib/extensionAuth";
import { requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ACTIVITY_LIMIT = 20;

export async function GET(request: NextRequest) {
  const secret = requireEnv("EXTENSION_SHARED_SECRET");
  if (!isExtensionAuthorized(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, email_id, type, at, confidence, is_self")
    .in("type", ["open", "click"])
    .eq("is_self", false)
    .order("at", { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const emailIds = [...new Set((events ?? []).map((event) => event.email_id))];
  const { data: emails, error: emailsError } = emailIds.length
    ? await supabase.from("emails").select("id, subject").in("id", emailIds)
    : { data: [], error: null };
  if (emailsError) return NextResponse.json({ error: emailsError.message }, { status: 500 });

  const subjectById = new Map((emails ?? []).map((email) => [email.id, email.subject] as const));
  const activity = (events ?? []).map((event) => ({
    id: event.id,
    emailId: event.email_id,
    type: event.type as "open" | "click",
    subject: subjectById.get(event.email_id) ?? "Tracked email",
    at: event.at,
    confidence: event.confidence,
  }));

  return NextResponse.json({ activity });
}
