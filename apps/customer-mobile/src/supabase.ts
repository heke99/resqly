import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

let client: SupabaseClient | null = null;

/**
 * Lazily create the Supabase client from public Expo env. Sessions persist
 * in AsyncStorage so the customer stays signed in between app starts.
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
