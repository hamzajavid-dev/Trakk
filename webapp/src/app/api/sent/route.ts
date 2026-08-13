import { NextRequest, NextResponse } from "next/server";
import { createEmailToken } from "@/lib/tokens";
import { isSafeRedirectUrl, signLink } from "@/lib/linkSig";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

interface SentBody {
  threadId: string;
  subject: string;
  recipientCount: number;
  links: string[];
}

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.EXTENSION_SHARED_SECRET}`;
  return header === expected;
}

export async function POST(req: NextRequest) {
  if (!process.env.EXTENSION_SHARED_SECRET) {
    throw new Error("EXTENSION_SHARED_SECRET must be set");
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as SentBody;
  if (!body.threadId || !body.subject || !Array.isArray(body.links)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const badLink = body.links.find((url) => !isSafeRedirectUrl(url));
  if (badLink) {
    return NextResponse.json(
      { error: `unsafe link url: ${badLink}` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .insert({
      token_hash: "pending",
      thread_id: body.threadId,
      subject: body.subject,
      recipient_count: body.recipientCount ?? 1,
    })
    .select()
    .single();
  if (emailError || !email) {
    return NextResponse.json({ error: emailError?.message }, { status: 500 });
  }

  const tokenSecret = process.env.TOKEN_SECRET!;
  const linkSigSecret = process.env.LINK_SIG_SECRET!;
  const baseUrl = process.env.APP_BASE_URL!;

  const token = createEmailToken(email.id, tokenSecret);
  const { hashWithSecret } = await import("@/lib/hash");
  const tokenHash = hashWithSecret(token, tokenSecret);

  await supabase.from("emails").update({ token_hash: tokenHash }).eq("id", email.id);

  const linkRows = body.links.map((url, idx) => ({
    email_id: email.id,
    idx,
    url,
    sig: signLink(email.id, idx, url, linkSigSecret),
  }));

  if (linkRows.length > 0) {
    const { error: linksError } = await supabase.from("links").insert(linkRows);
    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      emailId: email.id,
      pixelUrl: `${baseUrl}/p/${token}`,
      links: linkRows.map((row) => ({
        idx: row.idx,
        url: row.url,
        trackingUrl: `${baseUrl}/c/${token}/${row.idx}`,
      })),
    },
    { status: 201 },
  );
}
