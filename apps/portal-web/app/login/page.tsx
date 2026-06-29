"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@resqly/web-kit";
import { PORTAL_AUTH_COOKIE } from "../lib/constants";

function setSessionCookie(token: string, expiresIn?: number) {
  const maxAge = expiresIn && Number.isFinite(expiresIn) ? expiresIn : 60 * 60 * 8;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${PORTAL_AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

function portalBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_PORTAL_WEB_URL ?? window.location.origin).replace(/\/$/, "");
}

export default function PortalLoginPage() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

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

  async function sendPasswordLink() {
    if (!email) {
      setMessage("Enter your email first, then request a password link.");
      return;
    }
    setIsSendingReset(true);
    setMessage(null);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${portalBaseUrl()}/set-password`,
    });
    setIsSendingReset(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Password link sent. Open it from your email and set your portal password.");
  }

  return (
    <main style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Resqly portal login</h1>
      <p style={{ opacity: 0.7 }}>
        Insurance companies and towing companies sign in here. New portal users first open their invite email and set a password.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" style={{ marginTop: 16, padding: "10px 16px" }}>Log in</button>
      </form>
      <button
        type="button"
        onClick={sendPasswordLink}
        disabled={isSendingReset}
        style={{ marginTop: 12, padding: "8px 0", border: 0, background: "transparent", color: "#0B5FFF", cursor: "pointer" }}
      >
        {isSendingReset ? "Sending..." : "Need to set or reset your password?"}
      </button>
      {message ? <p style={{ marginTop: 16, color: message.includes("sent") ? "#057A55" : "#B00020" }}>{message}</p> : null}
    </main>
  );
}
