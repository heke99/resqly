"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@resqly/web-kit";

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
    try {
      // Server-side sign-in: session tokens live only in HttpOnly cookies.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "Inloggningen misslyckades. Kontrollera uppgifterna och försök igen.");
        return;
      }
      window.location.href = "/";
    } catch {
      setMessage("Kunde inte nå tjänsten. Kontrollera din uppkoppling.");
    } finally {
      setBusy(false);
    }
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
