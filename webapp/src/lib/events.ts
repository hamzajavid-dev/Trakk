import { after } from "next/server";
import type { NextRequest } from "next/server";
import { sha256Hex } from "./hash";
import { getSupabaseAdmin } from "./supabaseAdmin";

export function logEvent(
  req: NextRequest,
  event: { emailId: string; linkId?: string; type: "open" | "click" },
): void {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";

  after(async () => {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from("events").insert({
        email_id: event.emailId,
        link_id: event.linkId ?? null,
        type: event.type,
        ip_hash: sha256Hex(ip),
        ua_hash: sha256Hex(ua),
      });
    } catch {
      // Never let logging failures affect the caller — this runs after the response is sent.
    }
  });
}
