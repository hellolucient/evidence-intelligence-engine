/**
 * Supabase **server-only** admin client (service role).
 * Do not import from Client Components — bypasses RLS; keys must never ship to the browser.
 *
 * Phase 2: provided for upcoming persistence; engine and API routes do not use this yet.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client with the service role key.
 * @throws If required env vars are missing when called.
 */
export function createSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url?.trim()) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local for Supabase-backed features."
    );
  }
  if (!serviceRoleKey?.trim()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Server-side persistence requires the service role key in .env.local (never commit it)."
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}
