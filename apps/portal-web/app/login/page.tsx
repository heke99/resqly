"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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

const QUERY_MESSAGES: Record<string, string> = {
  session_expired: "Din session har gått ut. Logga in igen.",
  no_tenant_access: "Ditt konto är inte kopplat till någon organisation ännu. Kontakta din administratör.",
  unauthorized: "Du har inte behörighet att logga in här.",
};

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials")) return "Fel e-post eller lösenord. Försök igen.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "För många försök. Vänta en stund och försök igen.";
  if (msg.includes("network") || msg.includes("fetch")) return "Kunde inte nå tjänsten. Kontrollera din uppkoppling.";
  return "Inloggningen misslyckades. Kontrollera uppgifterna och försök igen.";
}

function PortalLoginInner() {
  const supabase = createBrowserSupabase();
  const params = useSearchParams();
  const queryMessage = QUERY_MESSAGES[params.get("error") ?? ""] ?? null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  if (!supabase) return <p>Inloggningen är inte tillgänglig just nu. Försök igen om en stund.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(friendlyAuthError(error.message));
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

  async function sendPasswordLink() {
    if (!email) {
      setMessage("Ange din e-postadress först och begär sedan en lösenordslänk.");
      return;
    }
    setIsSendingReset(true);
    setMessage(null);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${portalBaseUrl()}/set-password`,
    });
    setIsSendingReset(false);
    if (error) {
      setMessage(friendlyAuthError(error.message));
      return;
    }
    setMessage("Lösenordslänk skickad. Öppna mejlet och välj ett nytt lösenord.");
  }

  return (
    <main style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Logga in i portalen</h1>
      <p style={{ opacity: 0.7 }}>
        Försäkringsbolag och bärgningsbolag loggar in här. Nya användare öppnar först sin inbjudan via e-post och
        väljer ett lösenord.
      </p>
      {queryMessage ? <p style={{ color: "#B00020" }}>{queryMessage}</p> : null}
      <form onSubmit={submit}>
        <label htmlFor="email">E-post</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Lösenord</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" disabled={busy} style={{ marginTop: 16, padding: "10px 16px" }}>
          {busy ? "Loggar in…" : "Logga in"}
        </button>
      </form>
      <button
        type="button"
        onClick={sendPasswordLink}
        disabled={isSendingReset}
        style={{ marginTop: 12, padding: "8px 0", border: 0, background: "transparent", color: "#0B5FFF", cursor: "pointer" }}
      >
        {isSendingReset ? "Skickar…" : "Behöver du välja eller återställa lösenord?"}
      </button>
      {message ? <p style={{ marginTop: 16, color: message.includes("skickad") ? "#057A55" : "#B00020" }}>{message}</p> : null}
    </main>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={<p>Laddar…</p>}>
      <PortalLoginInner />
    </Suspense>
  );
}
