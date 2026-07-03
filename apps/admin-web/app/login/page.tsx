"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@resqly/web-kit";
import { ADMIN_AUTH_COOKIE } from "../lib/constants";

function setSessionCookie(token: string, expiresIn?: number) {
  const maxAge = expiresIn && Number.isFinite(expiresIn) ? expiresIn : 60 * 60 * 8;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ADMIN_AUTH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

export default function AdminLoginPage() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (!supabase) return <p>Inloggningen är inte tillgänglig just nu. Försök igen om en stund.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("Fel e-post eller lösenord. Försök igen.");
      return;
    }
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Inloggningen lyckades men sessionen kunde inte startas. Försök igen.");
      return;
    }
    setSessionCookie(token, data.session?.expires_in);
    window.location.href = "/";
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Intern kontroll — logga in</h1>
      <p style={{ opacity: 0.7 }}>Endast plattformsansvariga har åtkomst till den här portalen.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">E-post</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Lösenord</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" style={{ marginTop: 16, padding: "10px 16px" }}>Logga in</button>
      </form>
      {message ? <p style={{ marginTop: 16, color: "#B00020" }}>{message}</p> : null}
      <p style={{ marginTop: 16, opacity: 0.65 }}>
        Första gången: den första plattformsansvariga skapas enligt driftdokumentationen och loggar sedan in här.
      </p>
    </main>
  );
}
