/**
 * Envia una notificació de prova, des del servidor, a tots els dispositius subscrits de l'usuari.
 * Serveix per comprovar el circuit complet de Web Push (claus VAPID, subscripció i dispositiu).
 */
import * as webpush from "web-push";
import { adminClient, errorResponse, HttpError, requireUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) throw new HttpError(503, "Falten les claus VAPID al servidor");
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);

    const sb = adminClient();
    const { data: subs, error } = await sb.from("push_subscriptions").select("*").eq("user_id", user.id);
    if (error) throw new HttpError(500, error.message);
    if (!subs?.length) throw new HttpError(404, "Cap dispositiu subscrit");

    const payload = JSON.stringify({ title: "Tempo", body: "Notificació de prova des del servidor ✓", tag: `test-${Date.now()}`, url: "/settings" });
    let sent = 0;
    const failures: string[] = [];
    for (const d of subs) {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 600, urgency: "high" });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", d.id);
        failures.push(String(code ?? (err as Error).message));
      }
    }
    return Response.json({ sent, devices: subs.length, failures });
  } catch (e) {
    return errorResponse(e);
  }
}
