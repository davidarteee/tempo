import { z } from "zod";
import { adminClient, errorResponse, HttpError, requireUser } from "@/lib/supabase/server";

const Sub = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const parsed = Sub.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Invalid subscription");
    const { endpoint, keys } = parsed.data;
    const { error } = await adminClient()
      .from("push_subscriptions")
      .upsert({ user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null }, { onConflict: "endpoint" });
    if (error) throw new HttpError(500, error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const body = z.object({ endpoint: z.string().max(2000) }).safeParse(await req.json());
    if (!body.success) throw new HttpError(400, "Invalid body");
    await adminClient().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", body.data.endpoint);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
