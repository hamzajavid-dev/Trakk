"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrackingToggle({ emailId, enabled }: { emailId: string; enabled: boolean }) {
  const router = useRouter(); const [pending, setPending] = useState(false);
  async function toggle() { setPending(true); await fetch(`/api/dashboard/emails/${emailId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackingEnabled: !enabled }) }); setPending(false); router.refresh(); }
  return <button className={`tracking-toggle ${enabled ? "enabled" : ""}`} onClick={toggle} disabled={pending}><i />{pending ? "Updating…" : enabled ? "Tracking on" : "Tracking paused"}</button>;
}

export function EventControls({ eventId }: { eventId: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false);
  async function remove() { if (!window.confirm("Delete this raw tracking event? This cannot be undone.")) return; setPending(true); await fetch(`/api/dashboard/events/${eventId}`, { method: "DELETE" }); setPending(false); router.refresh(); }
  return <button className="delete-event" disabled={pending} onClick={remove}>{pending ? "Removing…" : "Delete"}</button>;
}
