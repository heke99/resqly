"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@resqly/web-kit";

interface SessionLike {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number;
}

/** Store the invite/recovery session server-side as HttpOnly cookies. */
async function storeSessionCookies(session: SessionLike): Promise<void> {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? null,
      expires_in: session.expires_in ?? null,
    }),
  }).catch(() => undefined);
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
        await storeSessionCookies(session);
        setMessage("Välj ett lösenord för ditt portalkonto.");
      } else {
        setMessage("Inbjudningslänken saknas eller har gått ut. Be din administratör skicka en ny inbjudan, eller begär en lösenordslänk från inloggningssidan.");
      }
    }
    load();
    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void storeSessionCookies(session);
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
      await storeSessionCookies(sessionData.session);
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
