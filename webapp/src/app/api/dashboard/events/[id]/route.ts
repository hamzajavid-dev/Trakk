import { NextResponse } from "next/server";
import { getDashboardUser } from "@/lib/dashboardAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/dashboard/events/[id]">) {
  if (!(await getDashboardUser())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
