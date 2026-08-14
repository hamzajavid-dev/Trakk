import { after } from "next/server";
import type { NextRequest } from "next/server";
import { classifyClient, classifyOpen, dedupeMatchesIp } from "./accuracy";
import { sha256Hex } from "./hash";
import { getSupabaseAdmin } from "./supabaseAdmin";

type EventType = "open" | "click";

export function logEvent(
  req: NextRequest,
  event: { emailId: string; linkId?: string; type: EventType },
): void {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  const ipHash = sha256Hex(ip);
  const uaHash = sha256Hex(ua);

  after(async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: email } = await supabase
        .from("emails")
        .select("sent_at, tracking_enabled")
        .eq("id", event.emailId)
        .maybeSingle();
      if (!email?.tracking_enabled) return;

      const { data: heartbeats } = await supabase
        .from("heartbeats")
        .select("ip_hash")
        .eq("ip_hash", ipHash)
        .gte("seen_at", new Date(Date.now() - 86_400_000).toISOString())
        .limit(1);
      const isSelf = (heartbeats?.length ?? 0) > 0;

      const classified = event.type === "open"
        ? classifyOpen({ ip, ua }, new Date(email.sent_at), new Date())
        : { type: "click" as const, isProxy: false, confidence: 100 };

      if (event.type === "open") {
        // Only dedupe against prior events of the SAME classified type — a
        // delivery-time prefetch and a later genuine open are different
        // things, and a prefetch must never suppress a real open that
        // happens to land within the same rolling window.
        let duplicateQuery = supabase
          .from("events")
          .select("id")
          .eq("email_id", event.emailId)
          .eq("ua_hash", uaHash)
          .eq("type", classified.type)
          .gte("at", new Date(Date.now() - 180_000).toISOString());
        if (dedupeMatchesIp(classified.isProxy)) duplicateQuery = duplicateQuery.eq("ip_hash", ipHash);
        const { data: duplicate } = await duplicateQuery.limit(1);
        if ((duplicate?.length ?? 0) > 0) return;
      }

      await supabase.from("events").insert({
        email_id: event.emailId,
        link_id: event.linkId ?? null,
        type: classified.type,
        ip_hash: ipHash,
        ua_hash: uaHash,
        is_proxy: classified.isProxy,
        is_self: isSelf,
        confidence: isSelf ? 0 : classified.confidence,
        client: classifyClient(ua, classified.isProxy),
      });
    } catch (error) {
      console.error("Could not log tracking event", error);
    }
  });
}
