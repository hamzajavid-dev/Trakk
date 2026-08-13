import { NextRequest, NextResponse } from "next/server";
import { isExtensionAuthorized } from "@/lib/extensionAuth";
import { requireEnv } from "@/lib/env";
import { sha256Hex } from "@/lib/hash";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function getClientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}

export async function POST(req: NextRequest) {
  const secret = requireEnv("EXTENSION_SHARED_SECRET");
  if (!isExtensionAuthorized(req, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await getSupabaseAdmin().from("heartbeats").upsert(
    { ip_hash: sha256Hex(getClientIp(req)), seen_at: new Date().toISOString() },
    { onConflict: "ip_hash" },
  );
  if (error) {
    console.error("Could not store extension heartbeat", error);
    return NextResponse.json({ error: "heartbeat unavailable" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
