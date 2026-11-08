import { adminClient } from "@/lib/supabase/server";
import { appUrl, emailFromIdToken, exchangeCode, verifyState } from "@/lib/google/oauth";
import { syncGoogle } from "@/lib/google/sync";

export const maxDuration = 60;

/** Retorn d'OAuth de Google: desa el refresh token (només al servidor) i fa la primera importació */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = appUrl(req);
  const fail = (reason: string) => Response.redirect(`${base}/settings?google=error&reason=${encodeURIComponent(reason)}`, 302);
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("missing_code");
  try {
    const userId = verifyState(state);
    const tokens = await exchangeCode(req, code);
    const sb = adminClient();
    const { data: existing } = await sb.from("google_integrations").select("refresh_token").eq("user_id", userId).maybeSingle();
    const refresh = tokens.refresh_token ?? existing?.refresh_token;
    if (!refresh) return fail("no_refresh_token");
    const { error } = await sb.from("google_integrations").upsert({
      user_id: userId,
      google_email: emailFromIdToken(tokens.id_token),
      refresh_token: refresh,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      google_calendar_id: "primary",
      sync_token: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    });
    if (error) return fail("store_failed");
    try {
      await syncGoogle(userId);
    } catch {
      // la primera sincronització es reintentarà des del client
    }
    return Response.redirect(`${base}/settings?google=connected`, 302);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "unknown");
  }
}
