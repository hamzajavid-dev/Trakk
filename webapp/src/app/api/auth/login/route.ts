import { NextRequest, NextResponse } from "next/server";
import { setDashboardSession, signInOwner } from "@/lib/dashboardAuth";

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  try {
    const accessToken = await signInOwner(email, password);
    if (!accessToken) {
      return NextResponse.json({ error: "Those credentials are not authorised for this dashboard." }, { status: 401 });
    }
    await setDashboardSession(accessToken);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Dashboard authentication is not configured yet." }, { status: 503 });
  }
}
