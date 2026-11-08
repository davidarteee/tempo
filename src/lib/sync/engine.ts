"use client";
/**
 * Motor de sincronització local-first.
 *
 *  ┌──────────┐  mutació  ┌───────────┐  push (upsert)  ┌──────────┐
 *  │   UI     │ ────────▶ │ IndexedDB │ ──────────────▶ │ Supabase │
 *  │(liveQuery)◀───────── │ + outbox  │ ◀────────────── │ Postgres │
 *  └──────────┘           └───────────┘ pull (cursor) + └──────────┘
 *                                        Realtime
 *
 * - Push: llegeix l'estat actual de cada fila de l'outbox (les escriptures es
 *   fusionen soles) i fa upsert per lots. Idempotent: reintentar és segur.
 * - Pull: demana files amb server_updated_at > cursor (amb solapament) per taula.
 * - Realtime: aplica canvis d'altres dispositius a l'instant i dispara un pull.
 * - Conflictes: Last-Write-Wins per fila segons updated_at, aplicat tant al
 *   servidor (trigger) com al client. Una fila amb canvis locals pendents no es
 *   sobreescriu fins que s'hagi pujat.
 * - Diverses pestanyes: un Web Lock garanteix que només una sincronitza alhora.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { db, getMeta, setMeta, table } from "../db/local";
import { SYNC_TABLES, type Profile, type SyncTable } from "../types";
import { onLocalChange } from "../db/repo";
import { supabase } from "../supabase/client";

export type SyncState = "local" | "offline" | "idle" | "syncing" | "error";

interface Status {
  state: SyncState;
  pending: number;
  failed: number;
  lastSyncedAt: number | null;
  error: string | null;
}

let status: Status = { state: "local", pending: 0, failed: 0, lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncStatus() {
  return status;
}
export function subscribeSyncStatus(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const BATCH = 200;
const PULL_PAGE = 1000;
const OVERLAP_MS = 5000;
const MAX_ATTEMPTS = 6;

let userId: string | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = 0;
let channel: RealtimeChannel | null = null;
let periodic: ReturnType<typeof setInterval> | null = null;
const afterSyncHooks = new Set<(pushed: number) => void>();

export function onAfterSync(cb: (pushed: number) => void) {
  afterSyncHooks.add(cb);
  return () => afterSyncHooks.delete(cb);
}

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function refreshCounts() {
  const d = db();
  const [pending, failed] = await Promise.all([d.outbox.where("dead").equals(0).count(), d.outbox.where("dead").equals(1).count()]);
  setStatus({ pending, failed });
}

/** Programa una sincronització (amb petit retard per agrupar canvis) */
export function scheduleSync(delay = 400) {
  if (!userId) {
    void refreshCounts();
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  const sb = supabase();
  if (!sb || !userId) return;
  if (!online()) {
    setStatus({ state: "offline" });
    await refreshCounts();
    return;
  }
  if (running) {
    scheduleSync(800);
    return;
  }
  running = true;
  setStatus({ state: "syncing", error: null });
  try {
    const work = async () => {
      const pushed = await push(sb);
      await pull(sb);
      return pushed;
    };
    const pushed =
      typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request("tempo-sync", work)
        : await work();
    backoff = 0;
    await refreshCounts();
    setStatus({ state: status.failed ? "error" : "idle", lastSyncedAt: Date.now(), error: status.failed ? "Alguns canvis no s'han pogut desar" : null });
    afterSyncHooks.forEach((h) => h(pushed));
    // Si durant la sincronització s'han afegit canvis, torna-hi
    if (status.pending > 0) scheduleSync(300);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    backoff = Math.min(backoff ? backoff * 2 : 2000, 60000);
    await refreshCounts();
    setStatus({ state: online() ? "error" : "offline", error: msg });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), backoff);
  } finally {
    running = false;
  }
}

// ───────────────────────── Push ─────────────────────────

function isRetryable(err: { code?: string; message?: string; status?: number } | null) {
  if (!err) return true;
  // Errors de validació/integritat de Postgres (classe 22 i 23) o RLS no milloraran reintentant
  if (err.code && /^(22|23|42501|PGRST)/.test(err.code)) return false;
  return true;
}

async function push(sb: SupabaseClient): Promise<number> {
  const d = db();
  const entries = await d.outbox.where("dead").equals(0).sortBy("seq");
  if (!entries.length) return 0;
  let pushed = 0;

  for (const t of SYNC_TABLES) {
    const forTable = entries.filter((e) => e.table === t);
    for (let i = 0; i < forTable.length; i += BATCH) {
      const chunk = forTable.slice(i, i + BATCH);
      const rows = (await table(t).bulkGet(chunk.map((c) => c.row_id))).filter(Boolean) as Record<string, unknown>[];
      const payload = rows
        .filter((r) => r.user_id === userId)
        .map((r) => {
          const { server_updated_at: _s, ...rest } = r;
          void _s;
          return rest;
        });

      if (payload.length) {
        const { data, error } = await sb.from(t).upsert(payload, { onConflict: "id" }).select("id, updated_at, server_updated_at");
        if (error) {
          if (!isRetryable(error) && chunk.length > 1) {
            // Aïlla la fila problemàtica pujant-les una a una
            for (const c of chunk) await pushSingle(sb, t, c.seq!, c.row_id);
            continue;
          }
          if (!isRetryable(error)) {
            await markFailed(chunk.map((c) => c.seq!), error.message, true);
            continue;
          }
          throw new Error(error.message);
        }
        // Files que el servidor ha descartat per LWW (tenia una versió més nova): les tornem a baixar
        const accepted = new Set((data ?? []).map((r) => r.id as string));
        const rejected = payload.map((r) => r.id as string).filter((id) => !accepted.has(id));
        if (rejected.length) await fetchRows(sb, t, rejected);
        if (data?.length) await stampServer(t, data as { id: string; updated_at: string; server_updated_at: string }[]);
      }
      // Esborra només les entrades processades si la fila no ha canviat mentrestant
      await removeProcessed(chunk.map((c) => c.seq!), t, rows);
      pushed += chunk.length;
    }
  }
  return pushed;
}

async function pushSingle(sb: SupabaseClient, t: SyncTable, seq: number, id: string) {
  const row = (await table(t).get(id)) as Record<string, unknown> | undefined;
  if (!row) {
    await db().outbox.delete(seq);
    return;
  }
  const { server_updated_at: _s, ...rest } = row;
  void _s;
  const { error } = await sb.from(t).upsert(rest, { onConflict: "id" });
  if (error) {
    await markFailed([seq], error.message, !isRetryable(error));
    return;
  }
  await db().outbox.delete(seq);
}

async function markFailed(seqs: number[], message: string, permanent: boolean) {
  const d = db();
  await d.transaction("rw", d.outbox, async () => {
    for (const s of seqs) {
      const e = await d.outbox.get(s);
      if (!e) continue;
      const attempts = e.attempts + 1;
      await d.outbox.update(s, { attempts, last_error: message, dead: permanent || attempts >= MAX_ATTEMPTS ? 1 : 0 });
    }
  });
}

async function removeProcessed(seqs: number[], t: SyncTable, sentRows: Record<string, unknown>[]) {
  const d = db();
  const sentAt = new Map(sentRows.map((r) => [r.id as string, r.updated_at as string]));
  await d.transaction("rw", [d.outbox, table(t)], async () => {
    for (const s of seqs) {
      const e = await d.outbox.get(s);
      if (!e) continue;
      const current = await table(t).get(e.row_id);
      // Si la fila s'ha tornat a modificar durant la pujada, manté l'entrada
      if (current && sentAt.has(e.row_id) && current.updated_at !== sentAt.get(e.row_id)) continue;
      await d.outbox.delete(s);
    }
  });
}

async function stampServer(t: SyncTable, rows: { id: string; updated_at: string; server_updated_at: string }[]) {
  await db().transaction("rw", table(t), async () => {
    for (const r of rows) {
      const cur = (await table(t).get(r.id)) as Record<string, unknown> | undefined;
      if (cur && cur.updated_at === r.updated_at) await table(t).update(r.id, { server_updated_at: r.server_updated_at } as never);
    }
  });
}

async function fetchRows(sb: SupabaseClient, t: SyncTable, ids: string[]) {
  const { data, error } = await sb.from(t).select("*").in("id", ids);
  if (error) throw new Error(error.message);
  await applyRemote(t, (data ?? []) as Record<string, unknown>[], true);
}

// ───────────────────────── Pull ─────────────────────────

async function pull(sb: SupabaseClient) {
  for (const t of SYNC_TABLES) {
    const cursorKey = `cursor:${t}`;
    let cursor = await getMeta<string | null>(cursorKey, null);
    for (let page = 0; page < 100; page++) {
      let q = sb.from(t).select("*").order("server_updated_at", { ascending: true }).limit(PULL_PAGE);
      if (cursor) q = q.gt("server_updated_at", new Date(Date.parse(cursor) - OVERLAP_MS).toISOString());
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) break;
      await applyRemote(t, rows);
      const last = rows[rows.length - 1].server_updated_at as string;
      const advanced = !cursor || last > cursor;
      cursor = last;
      await setMeta(cursorKey, cursor);
      if (rows.length < PULL_PAGE || !advanced) break;
    }
  }
  await pullProfile(sb);
}

async function pullProfile(sb: SupabaseClient) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId!).maybeSingle();
  if (data) {
    await db().profile.put(data as Profile);
    if ((data as Profile).default_calendar_id) await setMeta("default_calendar_id", (data as Profile).default_calendar_id);
  }
}

/**
 * Aplica files remotes a la base local respectant LWW i els canvis pendents.
 * `force` s'usa quan el servidor ha rebutjat la nostra versió (la seva és més nova).
 */
export async function applyRemote(t: SyncTable, rows: Record<string, unknown>[], force = false) {
  if (!rows.length) return;
  const d = db();
  await d.transaction("rw", [table(t), d.outbox], async () => {
    for (const r of rows) {
      const id = r.id as string;
      const local = (await table(t).get(id)) as Record<string, unknown> | undefined;
      if (local && !force) {
        const pending = await d.outbox.where("[table+row_id]").equals([t, id]).first();
        if (pending && !pending.dead) continue; // el canvi local guanyarà quan es pugi
        if ((local.updated_at as string) > (r.updated_at as string)) continue;
        if (local.updated_at === r.updated_at && local.server_updated_at === r.server_updated_at) continue;
      }
      if (force) {
        const pending = await d.outbox.where("[table+row_id]").equals([t, id]).first();
        if (pending) await d.outbox.delete(pending.seq!);
      }
      await table(t).put(normalize(r) as never);
    }
  });
}

function normalize(r: Record<string, unknown>) {
  const out = { ...r };
  // Postgres retorna "time" com HH:MM:SS i arrays buits com []
  if ("reminders" in out && !Array.isArray(out.reminders)) out.reminders = [];
  return out;
}

// ───────────────────────── Realtime ─────────────────────────

function subscribeRealtime(sb: SupabaseClient) {
  if (channel) void sb.removeChannel(channel);
  const ch = sb.channel(`tempo:${userId}`);
  for (const t of SYNC_TABLES) {
    ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `user_id=eq.${userId}` }, (payload) => {
      const row = payload.new as Record<string, unknown> | undefined;
      if (row && row.id) void applyRemote(t, [row]);
    });
  }
  ch.on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) => {
    if (payload.new && (payload.new as Profile).id) void db().profile.put(payload.new as Profile);
  });
  ch.subscribe((s) => {
    // En (re)connectar, recupera el que s'hagi perdut
    if (s === "SUBSCRIBED") scheduleSync(100);
  });
  channel = ch;
}

// ───────────────────────── Cicle de vida ─────────────────────────

const onOnline = () => {
  setStatus({ state: "idle" });
  scheduleSync(200);
};
const onOffline = () => setStatus({ state: "offline" });
const onVisible = () => {
  if (document.visibilityState === "visible") scheduleSync(200);
};

export function startSync(uid: string | null) {
  stopSync();
  userId = uid;
  onLocalChange(() => scheduleSync());
  if (!uid || !supabase()) {
    setStatus({ state: "local" });
    void refreshCounts();
    return;
  }
  const sb = supabase()!;
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  subscribeRealtime(sb);
  periodic = setInterval(() => scheduleSync(0), 60000);
  setStatus({ state: online() ? "idle" : "offline" });
  scheduleSync(0);
}

export function stopSync() {
  const sb = supabase();
  if (channel && sb) void sb.removeChannel(channel);
  channel = null;
  if (periodic) clearInterval(periodic);
  if (timer) clearTimeout(timer);
  periodic = null;
  timer = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
  }
  userId = null;
}

/** Torna a intentar els canvis que havien fallat */
export async function retryFailed() {
  const d = db();
  await d.outbox.where("dead").equals(1).modify({ dead: 0, attempts: 0 });
  scheduleSync(0);
}

export async function discardFailed() {
  const d = db();
  const dead = await d.outbox.where("dead").equals(1).toArray();
  await d.outbox.bulkDelete(dead.map((e) => e.seq!));
  // Força tornar a baixar aquestes files
  for (const t of SYNC_TABLES) await setMeta(`cursor:${t}`, null);
  scheduleSync(0);
}
