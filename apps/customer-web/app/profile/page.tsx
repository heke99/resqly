"use client";

import { useEffect, useState } from "react";
import { normalizePhoneE164 } from "@resqly/utils";
import { useSupabase } from "../lib/supabase-client";

export default function ProfilePage() {
  const supabase = useSupabase();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      setUserId(data.user.id);
      setEmail(data.user.email ?? null);
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, phone")
        .eq("id", data.user.id)
        .maybeSingle();
      const row = profile as { full_name?: string | null; phone?: string | null } | null;
      setFullName(row?.full_name ?? "");
      setPhone(row?.phone ?? "");
    })();
  }, [supabase]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !userId || busy) return;
    const normalizedPhone = normalizePhoneE164(phone);
    if (fullName.trim().length < 2) return setMessage("Ange ditt fullständiga namn.");
    if (!normalizedPhone) return setMessage("Ange ett giltigt mobilnummer, till exempel 0701234567.");
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("user_profiles").upsert({
      id: userId,
      email,
      full_name: fullName.trim(),
      phone: normalizedPhone,
    } as never);
    if (!error) {
      await supabase.auth.updateUser({ data: { full_name: fullName.trim(), phone: normalizedPhone } });
      setPhone(normalizedPhone);
    }
    setBusy(false);
    setMessage(error ? "Kontaktuppgifterna kunde inte sparas. Försök igen." : "Kontaktuppgifterna är sparade.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!supabase) return <p>Tjänsten är inte tillgänglig just nu. Försök igen om en stund.</p>;
  if (authed === false) return <p>Logga in via <a href="/login">inloggningen</a>.</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Profil och verifiering</h1>
      <p>Inloggad som {email}</p>
      <form className="tile" style={{ marginTop: 12 }} onSubmit={saveProfile}>
        <strong>Kontaktuppgifter för bärgning</strong>
        <p style={{ margin: "6px 0 12px" }}>Föraren får namn och telefonnummer först efter att uppdraget accepterats.</p>
        <label htmlFor="full_name">Fullständigt namn</label>
        <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <label htmlFor="phone">Mobilnummer</label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0701234567" required />
        <div style={{ marginTop: 12 }}><button className="bigbtn" type="submit" disabled={busy}>{busy ? "Sparar…" : "Spara uppgifter"}</button></div>
        {message ? <p>{message}</p> : null}
      </form>
      <div className="tile" style={{ marginTop: 12 }}>
        <strong>BankID-verifiering</strong>
        <p style={{ margin: "6px 0 0" }}>BankID används när ett fordon kopplas till försäkringsbolag och när ett försäkringsärende skickas vidare.</p>
      </div>
      <div style={{ marginTop: 16 }}><button className="bigbtn" onClick={signOut}>Logga ut</button></div>
    </div>
  );
}
