/**
 * Envia els recordatoris pendents per Web Push. S'ha de cridar cada minut
 * (pg_cron + pg_net a Supabase, o qualsevol planificador) amb
 *   Authorization: Bearer $CRON_SECRET
 * Vegeu README → "Notificacions push".
 */
import * as webpush from "web-push";
import { adminClient, errorResponse, HttpError } from "@/lib/supabase/server";
import { computeReminders } from "@/lib/notifications/reminders";
import { groupExceptions, type Dataset } from "@/lib/recurrence/occurrences";
import type { Category, EventException, EventRow, Task, TaskException } from "@/lib/types";

export const maxDuration = 60;
const CATCH_UP_MS = 5 * 60000;

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) throw new HttpError(503, "VAPID keys not configured");
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);

    const sb = adminClient();
    const { data: subs } = await sb.from("push_subscriptions").select("*");
    const byUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
    for (const s of subs ?? []) {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
      byUser.get(s.user_id)!.push(s);
    }

    const now = Date.now();
    const from = new Date(now - CATCH_UP_MS);
    const to = new Date(now + 30000);
    let sent = 0;

    for (const [userId, devices] of byUser) {
      const [ev, ex, tk, tx, cats] = await Promise.all([
        sb.from("events").select("*").eq("user_id", userId).is("deleted_at", null).neq("reminders", "{}"),
        sb.from("event_exceptions").select("*").eq("user_id", userId).is("deleted_at", null),
        sb.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null).neq("reminders", "{}").not("scheduled_date", "is", null),
        sb.from("task_exceptions").select("*").eq("user_id", userId).is("deleted_at", null),
        sb.from("categories").select("*").eq("user_id", userId),
      ]);
      const ds: Dataset = {
        events: (ev.data ?? []) as EventRow[],
        eventExceptions: groupExceptions((ex.data ?? []) as EventException[], (x) => x.event_id),
        tasks: ((tk.data ?? []) as Task[]).filter((t) => !t.completed_at || t.rrule),
        taskExceptions: groupExceptions((tx.data ?? []) as TaskException[], (x) => x.task_id),
        categories: new Map(((cats.data ?? []) as Category[]).map((c) => [c.id, c])),
      };
      const due = computeReminders(ds, from, to);
      for (const r of due) {
        const itemKey = `${r.key}@${r.fireAt.getTime()}`;
        // Reserva atòmica: si ja existeix, ja s'ha enviat
        const { data: claimed } = await sb.from("notification_log").upsert({ user_id: userId, item_key: itemKey }, { onConflict: "user_id,item_key", ignoreDuplicates: true }).select();
        if (!claimed?.length) continue;
        const payload = JSON.stringify({ title: r.title, body: r.body, tag: r.key, url: r.url });
        await Promise.all(
          devices.map(async (d) => {
            try {
              await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 3600, urgency: "high" });
              sent++;
            } catch (err) {
              const code = (err as { statusCode?: number }).statusCode;
              if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", d.id);
            }
          }),
        );
      }
    }
    // Neteja del registre antic
    await sb.from("notification_log").delete().lt("sent_at", new Date(now - 7 * 86400000).toISOString());
    return Response.json({ ok: true, sent });
  } catch (e) {
    return errorResponse(e);
  }
}
