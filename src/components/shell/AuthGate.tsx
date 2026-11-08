"use client";
/**
 * Determina l'usuari actiu i protegeix les rutes de l'aplicació.
 *  - Sense Supabase configurat → mode local (dades només en aquest dispositiu).
 *  - Amb Supabase → cal sessió; la sessió desada a localStorage permet obrir
 *    l'aplicació sense connexió.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { LOCAL_USER, setUserId } from "@/lib/session";
import { db, getMeta, setMeta, wipeLocal } from "@/lib/db/local";
import { adoptLocalData, createCategory, dedupeCategories } from "@/lib/db/repo";
import { onAfterSync, startSync, stopSync } from "@/lib/sync/engine";
import { toast } from "../ui/feedback";

interface AuthCtx {
  userId: string;
  user: User | null;
  local: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthGate");
  return c;
};

const DEFAULT_CATEGORIES: [string, string][] = [
  ["Personal", "#0A84FF"],
  ["Universitat", "#AF52DE"],
  ["Treball", "#FF9F0A"],
  ["Esport", "#30D158"],
  ["Altres", "#8E8E93"],
];

async function ensureLocalCategories() {
  if (await getMeta("local_seeded", false)) return;
  const existing = await db().categories.where("user_id").equals(LOCAL_USER).count();
  if (!existing) for (const [n, c] of DEFAULT_CATEGORIES) await createCategory(n, c);
  await setMeta("local_seeded", true);
}

/** Canvi d'usuari: neteja dades d'un altre compte i adopta les dades del mode local */
async function switchTo(uid: string) {
  const previous = await getMeta<string | null>("user_id", null);
  if (previous && previous !== uid && previous !== LOCAL_USER) await wipeLocal();
  await setMeta("user_id", uid);
  setUserId(uid);
  const localRows = (await db().events.where("user_id").equals(LOCAL_USER).count()) + (await db().tasks.where("user_id").equals(LOCAL_USER).count());
  if (localRows > 0) {
    const n = await adoptLocalData(uid);
    // Després de la primera sincronització es fusionaran les categories amb el mateix nom
    await setMeta("dedupe_categories", true);
    if (n) toast("Les dades d'aquest dispositiu s'han afegit al teu compte");
  } else {
    // Categories inicials del mode local sense ús: el compte ja té les seves
    const d = db();
    const local = await d.categories.where("user_id").equals(LOCAL_USER).primaryKeys();
    await d.transaction("rw", d.categories, d.outbox, async () => {
      await d.categories.bulkDelete(local);
      await d.outbox.filter((e) => e.table === "categories" && local.includes(e.row_id)).delete();
    });
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ userId: string; user: User | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = supabase();
    if (!isSupabaseConfigured || !sb) {
      setUserId(LOCAL_USER);
      void ensureLocalCategories().then(() => {
        if (cancelled) return;
        setState({ userId: LOCAL_USER, user: null });
        startSync(null);
      });
      return () => {
        cancelled = true;
        stopSync();
      };
    }

    let activeUid: string | null = null;
    const apply = async (user: User | null) => {
      if (cancelled) return;
      if (user && user.id === activeUid) return; // ja aplicat (getSession + SIGNED_IN)
      activeUid = user?.id ?? null;
      if (!user) {
        stopSync();
        setState(null);
        router.replace("/login");
        return;
      }
      await switchTo(user.id);
      if (cancelled) return;
      setState({ userId: user.id, user });
      startSync(user.id);
    };

    const offAfter = onAfterSync(() => {
      void getMeta("dedupe_categories", false).then(async (pending) => {
        if (!pending) return;
        await setMeta("dedupe_categories", false);
        await dedupeCategories();
      });
    });

    void sb.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        void wipeLocal().then(() => apply(null));
      } else if (event === "SIGNED_IN" && session?.user) {
        void apply(session.user);
      }
    });
    return () => {
      cancelled = true;
      offAfter();
      sub.subscription.unsubscribe();
      stopSync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg" aria-busy="true">
        <div className="size-6 animate-spin rounded-full border-2 border-fill-strong border-t-accent" />
      </div>
    );
  }

  const signOut = async () => {
    const sb = supabase();
    stopSync();
    if (sb) await sb.auth.signOut();
    await wipeLocal();
    router.replace("/login");
  };

  return <Ctx.Provider value={{ ...state, local: state.userId === LOCAL_USER, signOut }}>{children}</Ctx.Provider>;
}
