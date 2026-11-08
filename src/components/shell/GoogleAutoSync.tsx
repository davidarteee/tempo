"use client";
/**
 * Si Google Calendar està connectat, demana al servidor que sincronitzi:
 * en obrir l'aplicació, cada 5 minuts mentre és visible i poc després de pujar canvis.
 * Els canvis importats arriben als dispositius per Supabase Realtime.
 */
import { useEffect } from "react";
import { authHeader, supabase } from "@/lib/supabase/client";
import { onAfterSync } from "@/lib/sync/engine";
import { useAuth } from "./AuthGate";
import { setMeta } from "@/lib/db/local";

let connected: boolean | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export async function refreshGoogleStatus(): Promise<{ connected: boolean; email: string | null; lastSyncedAt: string | null; error: string | null }> {
  const sb = supabase();
  if (!sb) return { connected: false, email: null, lastSyncedAt: null, error: null };
  const { data } = await sb.from("google_integration_status").select("*").maybeSingle();
  connected = !!data;
  await setMeta("google_connected", connected);
  return { connected, email: data?.google_email ?? null, lastSyncedAt: data?.last_synced_at ?? null, error: data?.last_error ?? null };
}

export async function runGoogleSync(): Promise<{ ok: boolean; error?: string }> {
  if (running || !navigator.onLine) return { ok: false };
  running = true;
  try {
    const res = await fetch("/api/google/sync", { method: "POST", headers: await authHeader() });
    if (res.status === 404) connected = false;
    if (!res.ok) return { ok: false, error: ((await res.json().catch(() => ({}))) as { error?: string }).error };
    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    running = false;
  }
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (connected) void runGoogleSync();
  }, ms);
}

export function GoogleAutoSync() {
  const { local } = useAuth();
  useEffect(() => {
    if (local) return;
    void refreshGoogleStatus().then(() => schedule(1500));
    const off = onAfterSync((pushed) => {
      if (pushed > 0 && connected) schedule(2500);
    });
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && connected) void runGoogleSync();
    }, 5 * 60000);
    return () => {
      off();
      clearInterval(id);
      if (timer) clearTimeout(timer);
    };
  }, [local]);
  return null;
}
