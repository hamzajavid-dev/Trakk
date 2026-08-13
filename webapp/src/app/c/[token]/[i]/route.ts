import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/tokens";
import { isSafeRedirectUrl, verifyLinkSig } from "@/lib/linkSig";
import { requireEnv } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; i: string }> },
) {
  const { token, i } = await params;
  const tokenSecret = requireEnv("TOKEN_SECRET");
  const linkSigSecret = requireEnv("LINK_SIG_SECRET");

  const emailId = verifyEmailToken(token, tokenSecret);
  const idx = Number.parseInt(i, 10);
  if (!emailId || Number.isNaN(idx)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data: link } = await supabase
    .from("links")
    .select("id, url, sig")
    .eq("email_id", emailId)
    .eq("idx", idx)
    .single();

  if (!link) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!verifyLinkSig(emailId, idx, link.url, link.sig, linkSigSecret)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!isSafeRedirectUrl(link.url)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  logEvent(req, { emailId, linkId: link.id, type: "click" });

  return NextResponse.redirect(link.url, { status: 302 });
}
