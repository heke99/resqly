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

  if (!supabase) return <p>Unavailable until Supabase is configured.</p>;
  if (authed === false)
    return (
      <p>
        Please <a href="/login">log in</a>.
      </p>
    );

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Profile & BankID</h1>
      <p>Signed in as {email}</p>
      <div className="tile" style={{ marginTop: 12 }}>
        <strong>BankID verification</strong>
        <p style={{ margin: "6px 0 0" }}>
          BankID runs in test/mock mode. When you create an insurance-related case you will be asked
          to verify with BankID before it is sent to your insurance company.
        </p>
      </div>
      <div className="tile" style={{ marginTop: 12 }}>
        <strong>Consents</strong>
        <p style={{ margin: "6px 0 0" }}>
          You control data-sharing and insurance-connection consents. Your personal identity number
          is never shared with tow drivers.
        </p>
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="bigbtn" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
