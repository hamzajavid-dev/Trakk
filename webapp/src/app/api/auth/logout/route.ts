import { NextResponse } from "next/server";
import { clearDashboardSession } from "@/lib/dashboardAuth";

export async function POST() {
  await clearDashboardSession();
  return NextResponse.json({ ok: true });
}
