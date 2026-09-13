import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./config";

export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
