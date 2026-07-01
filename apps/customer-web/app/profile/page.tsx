"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "../lib/supabase-client";

export default function ProfilePage() {
  const supabase = useSupabase();
  const [email, setEmail] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      setEmail(data.user.email ?? null);
    })();
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!supabase) return <p>Tjänsten är inte tillgänglig förrän Supabase är konfigurerat.</p>;
  if (authed === false)
    return (
      <p>
        Logga in via <a href="/login">inloggningen</a>.
      </p>
    );

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Profil och verifiering</h1>
      <p>Inloggad som {email}</p>
      <div className="tile" style={{ marginTop: 12 }}>
        <strong>BankID-verifiering</strong>
        <p style={{ margin: "6px 0 0" }}>
          BankID används när ett fordon kopplas till försäkringsbolag och när ett försäkringsärende
          skickas vidare. Det är en verifiering/signering av uppgifterna, inte huvudmetoden för inloggning.
        </p>
      </div>
      <div className="tile" style={{ marginTop: 12 }}>
        <strong>Samtycken</strong>
        <p style={{ margin: "6px 0 0" }}>
          Du styr samtycken för datadelning och försäkringskoppling. Personnummer och BankID-detaljer
          delas aldrig med bärgare/förare.
        </p>
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="bigbtn" onClick={signOut}>
          Logga ut
        </button>
      </div>
    </div>
  );
}
