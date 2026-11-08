import { errorResponse, requireUser } from "@/lib/supabase/server";
import { syncGoogle } from "@/lib/google/sync";

export const maxDuration = 60;

// Evita sincronitzacions simultànies del mateix usuari dins d'una mateixa instància
const inflight = new Map<string, Promise<unknown>>();

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    let p = inflight.get(user.id);
    if (!p) {
      p = syncGoogle(user.id).finally(() => inflight.delete(user.id));
      inflight.set(user.id, p);
    }
    return Response.json(await p);
  } catch (e) {
    return errorResponse(e);
  }
}
