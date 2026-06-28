"use client";

import { useMemo } from "react";
import { createBrowserSupabase } from "@resqly/web-kit";

/** Memoized browser Supabase client for client components. */
export function useSupabase() {
  return useMemo(() => createBrowserSupabase(), []);
}
