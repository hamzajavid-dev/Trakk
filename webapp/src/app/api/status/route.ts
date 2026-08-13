import { NextRequest, NextResponse } from "next/server";
import { isExtensionAuthorized } from "@/lib/extensionAuth";
import { requireEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_THREAD_IDS = 100;

type ThreadState = {
  tracked: boolean;
  opens: number;
  clicks: number;
  firstOpenAt: string | null;
  lastOpenAt: string | null;
  confidence: number | null;
};

export async function GET(request: NextRequest) {
  const secret = requireEnv("EXTENSION_SHARED_SECRET");
  if (!isExtensionAuthorized(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawIds = request.nextUrl.searchParams.get("threadIds") ?? "";
  const threadIds = [...new Set(rawIds.split(",").map((id) => id.trim()).filter(Boolean))];
  if (threadIds.length === 0 || threadIds.length > MAX_THREAD_IDS) {
    return NextResponse.json({ error: `provide 1-${MAX_THREAD_IDS} thread IDs` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: emails, error: emailError } = await supabase
    .from("emails")
    .select("id, thread_id, tracking_enabled")
    .in("thread_id", threadIds);
  if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 });

  const emailIds = (emails ?? []).map((email) => email.id);
  const { data: events, error: eventError } = emailIds.length
    ? await supabase
      .from("events")
      .select("email_id, type, at, confidence, is_self")
      .in("email_id", emailIds)
      .order("at", { ascending: true })
    : { data: [], error: null };
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

  const states: Record<string, ThreadState> = Object.fromEntries(threadIds.map((threadId) => [threadId, {
    tracked: false, opens: 0, clicks: 0, firstOpenAt: null, lastOpenAt: null, confidence: null,
  }]));
  for (const email of emails ?? []) {
    const state = states[email.thread_id];
    if (!state || !email.tracking_enabled) continue;
    state.tracked = true;
    const emailEvents = (events ?? []).filter((event) => event.email_id === email.id);
    const opens = emailEvents.filter((event) => event.type === "open" && !event.is_self && event.confidence >= 60);
    const clicks = emailEvents.filter((event) => event.type === "click" && !event.is_self);
    state.opens += opens.length;
    state.clicks += clicks.length;
    if (opens.length) {
      state.firstOpenAt ??= opens[0].at;
      state.lastOpenAt = opens.at(-1)?.at ?? state.lastOpenAt;
      state.confidence = Math.max(state.confidence ?? 0, ...opens.map((event) => event.confidence));
    }
  }

  return NextResponse.json({ states });
}
