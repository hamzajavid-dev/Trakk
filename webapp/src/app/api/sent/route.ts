import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createEmailToken } from "@/lib/tokens";
import { hashWithSecret } from "@/lib/hash";
import { isSafeRedirectUrl, signLink } from "@/lib/linkSig";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { isExtensionAuthorized } from "@/lib/extensionAuth";

interface SentBody {
  threadId: string;
  subject: string;
  recipientCount: number;
  links: string[];
}

export async function POST(req: NextRequest) {
  const extensionSecret = requireEnv("EXTENSION_SHARED_SECRET");
  const tokenSecret = requireEnv("TOKEN_SECRET");
  const linkSigSecret = requireEnv("LINK_SIG_SECRET");
  const baseUrl = requireEnv("APP_BASE_URL");

  if (!isExtensionAuthorized(req, extensionSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SentBody;
  try {
    body = (await req.json()) as SentBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !body.threadId || !body.subject || !Array.isArray(body.links)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (
    body.recipientCount !== undefined &&
    !(Number.isInteger(body.recipientCount) && body.recipientCount > 0)
  ) {
    return NextResponse.json(
      { error: "recipientCount must be a positive integer" },
      { status: 400 },
    );
  }
  const badLink = body.links.find((url) => !isSafeRedirectUrl(url));
  if (badLink) {
    return NextResponse.json(
      { error: `unsafe link url: ${badLink}` },
      { status: 400 },
    );
  }

  const emailId = randomUUID();
  const token = createEmailToken(emailId, tokenSecret);
  const tokenHash = hashWithSecret(token, tokenSecret);

  const supabase = getSupabaseAdmin();
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .insert({
      id: emailId,
      token_hash: tokenHash,
      thread_id: body.threadId,
      subject: body.subject,
      recipient_count: body.recipientCount ?? 1,
    })
    .select()
    .single();
  if (emailError || !email) {
    return NextResponse.json({ error: emailError?.message }, { status: 500 });
  }

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
