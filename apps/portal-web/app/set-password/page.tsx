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
  const [message, setMessage] = useState("Kontrollerar inbjudningslänken…");
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
        setMessage("Välj ett lösenord för ditt portalkonto.");
      } else {
        setMessage("Inbjudningslänken saknas eller har gått ut. Be din administratör skicka en ny inbjudan, eller begär en lösenordslänk från inloggningssidan.");
      }
    }
    load();
    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setSessionCookie(session.access_token, session.expires_in);
        setHasSession(true);
        setMessage("Välj ett lösenord för ditt portalkonto.");
      }
    }) ?? { data: null };
    return () => {
      active = false;
      data?.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!supabase) return <p>Sidan är inte tillgänglig just nu. Försök igen om en stund.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Lösenorden matchar inte.");
      return;
    }
    setIsSaving(true);
    const { data, error } = await supabase!.auth.updateUser({ password });
    setIsSaving(false);
    if (error) {
      setMessage("Lösenordet kunde inte sparas. Försök igen.");
      return;
    }
    const { data: sessionData } = await supabase!.auth.getSession();
    if (sessionData.session?.access_token) {
      setSessionCookie(sessionData.session.access_token, sessionData.session.expires_in);
    }
    setMessage(`Lösenordet är sparat för ${data.user?.email ?? "ditt konto"}. Du skickas vidare…`);
    window.setTimeout(() => {
      window.location.href = "/";
    }, 700);
  }

  return (
    <main style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Välj lösenord</h1>
      <p style={{ opacity: 0.7 }}>
        Använd den här sidan efter att du öppnat en inbjudan eller lösenordslänk från Resqly.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="password">Nytt lösenord</label>
        <input
          id="password"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!hasSession || isSaving}
          required
        />
        <label htmlFor="confirmPassword">Bekräfta lösenordet</label>
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
          {isSaving ? "Sparar…" : "Spara lösenord"}
        </button>
      </form>
      {message ? <p style={{ marginTop: 16 }}>{message}</p> : null}
      <p style={{ marginTop: 16 }}><a href="/login">Tillbaka till inloggningen</a></p>
    </main>
  );
}
