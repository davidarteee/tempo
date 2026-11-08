"use client";
/**
 * Client de Supabase per al navegador. La sessió es desa a localStorage perquè
 * l'aplicació continuï funcionant sense connexió (l'estat d'autenticació
 * no depèn d'una petició al servidor).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: "tempo-auth",
      },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

/** Capçalera d'autorització per a les rutes /api del propi servidor */
export async function authHeader(): Promise<Record<string, string>> {
  const sb = supabase();
  if (!sb) return {};
  const { data } = await sb.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
