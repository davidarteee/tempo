import { adminClient, errorResponse, HttpError, requireUser } from "@/lib/supabase/server";
import { authUrl, googleConfigured, revokeToken } from "@/lib/google/oauth";

/** Inicia la connexió: retorna l'URL d'autorització de Google */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    if (!googleConfigured()) throw new HttpError(503, "La integració amb Google no està configurada al servidor");
    return Response.json({ url: authUrl(req, user.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Desconnecta: revoca el token i esborra la vinculació (els esdeveniments importats es conserven) */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const sb = adminClient();
    const { data } = await sb.from("google_integrations").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (data?.refresh_token) await revokeToken(data.refresh_token);
    await sb.from("google_sync_records").delete().eq("user_id", user.id);
    await sb.from("google_integrations").delete().eq("user_id", user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
