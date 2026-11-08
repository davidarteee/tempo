import "server-only";
/**
 * Clients de Supabase per al servidor. La service role NOMÉS s'utilitza aquí
 * (rutes /api), mai al navegador.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export function adminClient(): SupabaseClient {
  if (!url || !service) throw new HttpError(503, "Supabase service key is not configured");
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Valida el JWT de l'usuari (capçalera Authorization: Bearer) i retorna el seu id */
export async function requireUser(req: Request): Promise<{ id: string; email: string | null }> {
  if (!url || !anon) throw new HttpError(503, "Supabase is not configured");
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing token");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session");
  return { id: data.user.id, email: data.user.email ?? null };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
