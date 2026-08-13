import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/tokens";
import { sha256Hex } from "@/lib/hash";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PIXEL_GIF, PIXEL_HEADERS } from "@/lib/pixel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tokenSecret = process.env.TOKEN_SECRET!;
  const emailId = verifyEmailToken(token, tokenSecret);

  if (emailId) {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    try {
      const supabase = getSupabaseAdmin();
      supabase
        .from("events")
        .insert({
          email_id: emailId,
          type: "open",
          ip_hash: sha256Hex(ip),
          ua_hash: sha256Hex(ua),
        })
        .then(
          () => {},
          () => {},
        );
    } catch {
      // Never let logging failures affect the pixel response.
    }
  }

  return new NextResponse(new Uint8Array(PIXEL_GIF), { headers: PIXEL_HEADERS });
}
