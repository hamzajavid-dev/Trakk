import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, type User } from "@supabase/supabase-js";

const SESSION_COOKIE = "trakk_dashboard_session";

function getAuthConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const ownerEmail = process.env.DASHBOARD_OWNER_EMAIL?.trim().toLowerCase();

  if (!url || !key || !ownerEmail) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, and DASHBOARD_OWNER_EMAIL must be set for dashboard authentication",
    );
  }

  return { url, key, ownerEmail };
}

function isOwner(user: User, ownerEmail: string) {
  return user.email?.toLowerCase() === ownerEmail;
}

export async function signInOwner(email: string, password: string) {
  const { url, key, ownerEmail } = getAuthConfig();
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user || !isOwner(data.user, ownerEmail)) {
    return null;
  }

  return data.session.access_token;
}

export async function getDashboardUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { url, key, ownerEmail } = getAuthConfig();
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || !isOwner(data.user, ownerEmail)) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function requireDashboardUser() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return user;
}

export async function setDashboardSession(accessToken: string) {
  (await cookies()).set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearDashboardSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
