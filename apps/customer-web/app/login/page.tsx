"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../lib/supabase-client";
import { SESSION_MARKER_COOKIE } from "../lib/session-marker";
import { normalizePhoneE164 } from "@resqly/utils";

function safeNextPath(raw: string | null): string {
  // Only same-origin relative paths are allowed as post-login destinations.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function LoginInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
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
    const normalizedPhone = mode === "sign_up" ? normalizePhoneE164(phone) : null;
    if (mode === "sign_up" && fullName.trim().length < 2) {
      setBusy(false);
      setMessage("Ange ditt fullständiga namn.");
      return;
    }
    if (mode === "sign_up" && !normalizedPhone) {
      setBusy(false);
      setMessage("Ange ett giltigt mobilnummer, till exempel 0701234567.");
      return;
    }
    const result =
      mode === "sign_in"
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName.trim(), phone: normalizedPhone } },
          });
    setBusy(false);
    if (result.error) setMessage(friendlyAuthError(result.error.message));
    else {
      if (mode === "sign_up" && !result.data.session) {
        setMessage("Kontot är skapat. Bekräfta din e-postadress via mejlet vi skickade och logga sedan in.");
        return;
      }
      const userData = result.data.user ? { user: result.data.user } : (await supabase!.auth.getUser()).data;
      if (userData.user) {
        const profile: Record<string, unknown> = {
          id: userData.user.id,
          email: userData.user.email ?? null,
        };
        if (mode === "sign_up") {
          profile.full_name = fullName.trim();
          profile.phone = normalizedPhone;
        }
        const { error: profileError } = await supabase!.from("user_profiles").upsert(profile as never);
        if (profileError) {
          setMessage("Kontot skapades men kontaktuppgifterna kunde inte sparas. Öppna Profil innan du begär bärgning.");
          return;
        }
      }
      // Set the middleware marker before navigating so protected pages open
      // directly (the layout session listener keeps it in sync afterwards).
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${SESSION_MARKER_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${secure}`;
      setMessage(mode === "sign_up" ? "Kontot är skapat. Du kan nu använda tjänsten." : "Du är inloggad.");
      window.location.href = nextPath;
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{mode === "sign_in" ? "Logga in" : "Skapa konto"}</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">E-post</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode === "sign_up" ? (
          <>
            <label htmlFor="full_name">Fullständigt namn</label>
            <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            <label htmlFor="phone">Mobilnummer</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="0701234567" required />
          </>
        ) : null}
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

export default function LoginPage() {
  return (
    <Suspense fallback={<p>Laddar…</p>}>
      <LoginInner />
    </Suspense>
  );
}
