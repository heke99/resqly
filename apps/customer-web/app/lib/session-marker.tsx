"use client";

import { useEffect } from "react";
import { useSupabase } from "./supabase-client";

export const SESSION_MARKER_COOKIE = "resqly_customer_session";

function writeMarker(present: boolean) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  if (present) {
    document.cookie = `${SESSION_MARKER_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${secure}`;
  } else {
    document.cookie = `${SESSION_MARKER_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  }
}

/**
 * Keeps a non-sensitive "logged in" marker cookie in sync with the Supabase
 * browser session. The middleware uses it to redirect logged-out visitors away
 * from protected pages early; it grants no access by itself (RLS + client
 * auth checks remain the real gate).
 */
export function SessionMarker() {
  const supabase = useSupabase();
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) writeMarker(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      writeMarker(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);
  return null;
}
