import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/tokens";
import { requireEnv } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { PIXEL_GIF, PIXEL_HEADERS } from "@/lib/pixel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const tokenSecret = requireEnv("TOKEN_SECRET");
    const emailId = verifyEmailToken(token, tokenSecret);

    if (emailId) {
      logEvent(req, { emailId, type: "open" });
    }
  } catch {
    // Never let a missing/invalid token or config affect the pixel response.
  }

  return new NextResponse(new Uint8Array(PIXEL_GIF), { headers: PIXEL_HEADERS });
}
