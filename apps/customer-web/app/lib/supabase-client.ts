"use client";

import { useMemo } from "react";
import { createBrowserSupabase } from "@roadside/web-kit";

/** Memoized browser Supabase client for client components. */
export function useSupabase() {
  return useMemo(() => createBrowserSupabase(), []);
}
