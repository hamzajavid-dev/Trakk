"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    const result = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setError(result.error ?? "Unable to sign in."); return; }
    router.replace("/dashboard"); router.refresh();
  }

  return <form className="login-form" onSubmit={submit}>
    <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? "Signing in…" : "Sign in to Trakk"} <span aria-hidden>→</span></button>
  </form>;
}
