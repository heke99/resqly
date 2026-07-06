"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        setMessage(json.error ?? "Inloggningen misslyckades. Försök igen.");
        return;
      }
      window.location.href = "/";
    } catch {
      setMessage("Kunde inte nå tjänsten. Kontrollera din uppkoppling.");
    } finally {
      setBusy(false);
    }
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
        <button type="submit" disabled={busy} style={{ marginTop: 16, padding: "10px 16px" }}>
          {busy ? "Loggar in…" : "Logga in"}
        </button>
      </form>
      {message ? <p style={{ marginTop: 16, color: "#B00020" }}>{message}</p> : null}
      <p style={{ marginTop: 16, opacity: 0.65 }}>
        Första gången: den första plattformsansvariga skapas enligt driftdokumentationen och loggar sedan in här.
      </p>
    </main>
  );
}
