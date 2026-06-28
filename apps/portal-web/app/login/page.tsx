"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@resqly/web-kit";
import { PORTAL_AUTH_COOKIE } from "../lib/constants";

function setSessionCookie(token: string, expiresIn?: number) {
  const maxAge = expiresIn && Number.isFinite(expiresIn) ? expiresIn : 60 * 60 * 8;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${PORTAL_AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

export default function PortalLoginPage() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (!supabase) return <p>Portal sign-in is unavailable until Supabase is configured.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Signed in, but no session token was returned.");
      return;
    }
    setSessionCookie(token, data.session?.expires_in);
    window.location.href = "/";
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Resqly portal login</h1>
      <p style={{ opacity: 0.7 }}>Sign in with a user created under your insurance or towing tenant.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" style={{ marginTop: 16, padding: "10px 16px" }}>Log in</button>
      </form>
      {message ? <p style={{ marginTop: 16, color: "#B00020" }}>{message}</p> : null}
    </main>
  );
}
