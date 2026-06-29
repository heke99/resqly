"use client";

import { useState } from "react";
import { useSupabase } from "../lib/supabase-client";

export default function LoginPage() {
  const supabase = useSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [message, setMessage] = useState<string | null>(null);

  if (!supabase) {
    return <p>Sign-in is unavailable until Supabase is configured.</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const fn =
      mode === "sign_in"
        ? supabase!.auth.signInWithPassword({ email, password })
        : supabase!.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) setMessage(error.message);
    else {
      const { data: userData } = await supabase!.auth.getUser();
      if (userData.user) {
        await supabase!.from("user_profiles").upsert({
          id: userData.user.id,
          email: userData.user.email ?? null,
        } as never);
      }
      setMessage(mode === "sign_up" ? "Account created. You can now use the app." : "Signed in.");
      window.location.href = "/";
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{mode === "sign_in" ? "Log in" : "Create account"}</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit">
            {mode === "sign_in" ? "Log in" : "Create account"}
          </button>
        </div>
      </form>
      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
      <p style={{ marginTop: 16 }}>
        <a onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")} style={{ cursor: "pointer" }}>
          {mode === "sign_in" ? "Need an account? Sign up" : "Have an account? Log in"}
        </a>
      </p>
    </div>
  );
}
