"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@resqly/web-kit";
import { PORTAL_AUTH_COOKIE } from "../lib/constants";

function setSessionCookie(token: string, expiresIn?: number) {
  const maxAge = expiresIn && Number.isFinite(expiresIn) ? expiresIn : 60 * 60 * 8;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${PORTAL_AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

export default function SetPasswordPage() {
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("Checking invite link...");
  const [hasSession, setHasSession] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      setHasSession(Boolean(session));
      if (session?.access_token) {
        setSessionCookie(session.access_token, session.expires_in);
        setMessage("Choose a password for your Resqly portal account.");
      } else {
        setMessage("The invite link is missing or expired. Ask your Resqly admin to resend the invite, or request a password link from the login page.");
      }
    }
    load();
    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setSessionCookie(session.access_token, session.expires_in);
        setHasSession(true);
        setMessage("Choose a password for your Resqly portal account.");
      }
    }) ?? { data: null };
    return () => {
      active = false;
      data?.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!supabase) return <p>Set password is unavailable until Supabase is configured.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setIsSaving(true);
    const { data, error } = await supabase!.auth.updateUser({ password });
    setIsSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    const { data: sessionData } = await supabase!.auth.getSession();
    if (sessionData.session?.access_token) {
      setSessionCookie(sessionData.session.access_token, sessionData.session.expires_in);
    }
    setMessage(`Password saved for ${data.user?.email ?? "your account"}. Redirecting...`);
    window.setTimeout(() => {
      window.location.href = "/";
    }, 700);
  }

  return (
    <main style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Set portal password</h1>
      <p style={{ opacity: 0.7 }}>
        Use this page after opening an invite or password reset link from Resqly.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!hasSession || isSaving}
          required
        />
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          type="password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={!hasSession || isSaving}
          required
        />
        <button type="submit" disabled={!hasSession || isSaving} style={{ marginTop: 16, padding: "10px 16px" }}>
          {isSaving ? "Saving..." : "Save password"}
        </button>
      </form>
      {message ? <p style={{ marginTop: 16 }}>{message}</p> : null}
      <p style={{ marginTop: 16 }}><a href="/login">Back to login</a></p>
    </main>
  );
}
