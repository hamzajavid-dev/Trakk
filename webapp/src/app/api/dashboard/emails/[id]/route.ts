import { NextRequest, NextResponse } from "next/server";
import { getDashboardUser } from "@/lib/dashboardAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: NextRequest, { params }: RouteContext<"/api/dashboard/emails/[id]">) {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await params;

  let body: { trackingEnabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.trackingEnabled !== "boolean") {
    return NextResponse.json({ error: "trackingEnabled must be a boolean" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("emails")
    .update({ tracking_enabled: body.trackingEnabled })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
