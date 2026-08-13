import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/tokens";
import { isSafeRedirectUrl, verifyLinkSig } from "@/lib/linkSig";
import { sha256Hex } from "@/lib/hash";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; i: string }> },
) {
  const { token, i } = await params;
  const tokenSecret = process.env.TOKEN_SECRET!;
  const linkSigSecret = process.env.LINK_SIG_SECRET!;

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

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";

  try {
    supabase
      .from("events")
      .insert({
        email_id: emailId,
        link_id: link.id,
        type: "click",
        ip_hash: sha256Hex(ip),
        ua_hash: sha256Hex(ua),
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // Never let logging failures affect the redirect.
  }

  return NextResponse.redirect(link.url, { status: 302 });
}
