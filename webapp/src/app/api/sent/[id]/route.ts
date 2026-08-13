import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { isExtensionAuthorized } from "@/lib/extensionAuth";

interface PatchBody {
  threadId: string;
}

// Gmail does not assign a real thread ID to a brand-new compose until the
// send actually completes, so the extension registers the email at presend
// time with a placeholder threadId, then calls this once InboxSDK's `sent`
// event resolves the real one — otherwise the thread list can never match
// a Sent row back to its tracked email.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const extensionSecret = requireEnv("EXTENSION_SHARED_SECRET");
  if (!isExtensionAuthorized(req, extensionSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !body.threadId || typeof body.threadId !== "string") {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("emails")
    .update({ thread_id: body.threadId })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
