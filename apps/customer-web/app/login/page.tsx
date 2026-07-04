"use client";

import { useState } from "react";
import { useSupabase } from "../lib/supabase-client";

export default function LoginPage() {
  const supabase = useSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabase) {
    return <p>Inloggningen är inte tillgänglig just nu. Försök igen om en stund.</p>;
  }

  function friendlyAuthError(raw: string): string {
    const msg = raw.toLowerCase();
    if (msg.includes("invalid login credentials")) return "Fel e-post eller lösenord. Försök igen.";
    if (msg.includes("already registered")) return "Det finns redan ett konto med den e-postadressen. Logga in i stället.";
    if (msg.includes("password should be")) return "Lösenordet är för kort. Använd minst 6 tecken.";
    if (msg.includes("rate limit") || msg.includes("too many")) return "För många försök. Vänta en stund och försök igen.";
    if (msg.includes("email not confirmed")) return "Bekräfta din e-postadress via mejlet vi skickade, och logga sedan in.";
    if (msg.includes("network") || msg.includes("fetch")) return "Kunde inte nå tjänsten. Kontrollera din uppkoppling och försök igen.";
    return "Inloggningen misslyckades. Kontrollera uppgifterna och försök igen.";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const fn =
      mode === "sign_in"
        ? supabase!.auth.signInWithPassword({ email, password })
        : supabase!.auth.signUp({ email, password });
    const { error } = await fn;
    setBusy(false);
    if (error) setMessage(friendlyAuthError(error.message));
    else {
      const { data: userData } = await supabase!.auth.getUser();
      if (userData.user) {
        await supabase!.from("user_profiles").upsert({
          id: userData.user.id,
          email: userData.user.email ?? null,
        } as never);
      }
      setMessage(mode === "sign_up" ? "Kontot är skapat. Du kan nu använda tjänsten." : "Du är inloggad.");
      window.location.href = "/";
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{mode === "sign_in" ? "Logga in" : "Skapa konto"}</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">E-post</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Lösenord</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit" disabled={busy}>
            {busy ? "Vänta…" : mode === "sign_in" ? "Logga in" : "Skapa konto"}
          </button>
        </div>
      </form>
      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
      <p style={{ marginTop: 16 }}>
        <a onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")} style={{ cursor: "pointer" }}>
          {mode === "sign_in" ? "Behöver du konto? Skapa konto" : "Har du redan konto? Logga in"}
        </a>
      </p>
    </div>
  );
}
