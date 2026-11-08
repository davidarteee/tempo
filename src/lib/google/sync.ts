import "server-only";
/**
 * Sincronització bidireccional amb Google Calendar (servidor, service role).
 *
 * 1. PULL: canvis incrementals de Google (syncToken). Cada esdeveniment es vincula
 *    a un esdeveniment local via google_sync_records (o extendedProperties.tempoId).
 * 2. PUSH: esdeveniments locals nous/modificats/eliminats des de l'última sincronització.
 *
 * Evitar bucles i duplicats:
 *  - Es desa l'etag de Google i l'empremta (fingerprint) del contingut local després
 *    de cada operació. Un canvi només es propaga si l'etag o l'empremta són diferents.
 *  - Els esdeveniments creats des de Tempo porten tempoId; si en tornar a llegir-los no
 *    hi ha registre, es reconnecten en lloc de duplicar-se.
 * Conflictes (canviat als dos costats): guanya la modificació més recent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventException, EventRow } from "../types";
import { adminClient, HttpError } from "../supabase/server";
import { refreshAccessToken } from "./oauth";
import { eventFromGoogle, eventToGoogle, exceptionToGoogle, fingerprint, instanceId, occurrenceKeyFromGoogle, type GEvent } from "./mapping";
import { exceptionId, uuid } from "../db/ids";

const API = "https://www.googleapis.com/calendar/v3";

interface Integration {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  google_calendar_id: string;
  sync_token: string | null;
  last_synced_at: string | null;
}

interface SyncRecord {
  id: string;
  user_id: string;
  event_id: string | null;
  exception_id: string | null;
  google_calendar_id: string;
  google_event_id: string;
  google_etag: string | null;
  local_fingerprint: string | null;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
  conflicts: number;
}

class Google {
  constructor(private token: string, private calendarId: string) {}
  private url(path: string) {
    return `${API}/calendars/${encodeURIComponent(this.calendarId)}${path}`;
  }
  async req<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<{ status: number; data: T | null }> {
    const q = query ? `?${new URLSearchParams(query)}` : "";
    const res = await fetch(this.url(path) + q, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return { status: 204, data: null };
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok && ![404, 410, 412].includes(res.status)) {
      const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? res.statusText;
      throw new HttpError(res.status === 401 ? 401 : 502, `Google: ${msg}`);
    }
    return { status: res.status, data };
  }
}

async function accessToken(sb: SupabaseClient, integ: Integration): Promise<string> {
  if (integ.access_token && integ.access_token_expires_at && Date.parse(integ.access_token_expires_at) > Date.now() + 60000) return integ.access_token;
  const t = await refreshAccessToken(integ.refresh_token);
  const expires = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await sb.from("google_integrations").update({ access_token: t.access_token, access_token_expires_at: expires, ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}) }).eq("user_id", integ.user_id);
  return t.access_token;
}

function stamp(prev?: string | null) {
  const now = Date.now();
  const p = prev ? Date.parse(prev) + 1 : 0;
  return new Date(Math.max(now, p)).toISOString();
}

export async function syncGoogle(userId: string): Promise<SyncResult> {
  const sb = adminClient();
  const { data: integ } = await sb.from("google_integrations").select("*").eq("user_id", userId).maybeSingle<Integration>();
  if (!integ) throw new HttpError(404, "Google Calendar no està connectat");
  const result: SyncResult = { pulled: 0, pushed: 0, deleted: 0, conflicts: 0 };
  const startedAt = new Date().toISOString();

  try {
    const token = await accessToken(sb, integ);
    const g = new Google(token, integ.google_calendar_id);
    const { data: profile } = await sb.from("profiles").select("timezone, default_calendar_id").eq("id", userId).maybeSingle();
    const tz = profile?.timezone ?? "Europe/Madrid";

    // Estat local
    const [{ data: recRows }, { data: evRows }, { data: exRows }] = await Promise.all([
      sb.from("google_sync_records").select("*").eq("user_id", userId).eq("google_calendar_id", integ.google_calendar_id),
      sb.from("events").select("*").eq("user_id", userId),
      sb.from("event_exceptions").select("*").eq("user_id", userId),
    ]);
    const records = new Map<string, SyncRecord>((recRows ?? []).map((r: SyncRecord) => [r.google_event_id, r]));
    const recByEvent = new Map<string, SyncRecord>();
    const recByException = new Map<string, SyncRecord>();
    for (const r of records.values()) {
      if (r.event_id && !r.exception_id) recByEvent.set(r.event_id, r);
      if (r.exception_id) recByException.set(r.exception_id, r);
    }
    const events = new Map<string, EventRow>((evRows ?? []).map((e: EventRow) => [e.id, e]));
    const exceptions = new Map<string, EventException>((exRows ?? []).map((x: EventException) => [x.id, x]));
    const touchedLocally = new Set<string>(); // files que acabem de modificar des de Google

    const saveRecord = async (r: Omit<SyncRecord, "id" | "user_id" | "google_calendar_id"> & { id?: string }) => {
      const row = { ...r, user_id: userId, google_calendar_id: integ.google_calendar_id, last_synced_at: new Date().toISOString() };
      const { data, error } = await sb.from("google_sync_records").upsert(row, { onConflict: "user_id,google_calendar_id,google_event_id" }).select().single();
      if (error) throw new HttpError(500, error.message);
      records.set(data.google_event_id, data);
      if (data.exception_id) recByException.set(data.exception_id, data);
      else if (data.event_id) recByEvent.set(data.event_id, data);
    };

    // ─────────────── 1. PULL ───────────────
    let syncToken = integ.sync_token;
    const changed: GEvent[] = [];
    let nextSyncToken: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      let pageToken: string | undefined;
      changed.length = 0;
      let gone = false;
      do {
        const q: Record<string, string> = { maxResults: "250", showDeleted: "true", singleEvents: "false" };
        if (syncToken) q.syncToken = syncToken;
        else q.timeMin = new Date(Date.now() - 365 * 86400000).toISOString();
        if (pageToken) q.pageToken = pageToken;
        const res = await g.req<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>("GET", "/events", undefined, q);
        if (res.status === 410) {
          gone = true;
          break;
        }
        changed.push(...(res.data?.items ?? []));
        pageToken = res.data?.nextPageToken;
        nextSyncToken = res.data?.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      if (!gone) break;
      syncToken = null; // el token ha caducat: sincronització completa
    }

    // Primer els esdeveniments principals, després les instàncies modificades
    changed.sort((a, b) => Number(!!a.recurringEventId) - Number(!!b.recurringEventId));
    const upsertEvents: EventRow[] = [];
    const upsertExceptions: EventException[] = [];

    for (const ge of changed) {
      const rec = records.get(ge.id);
      if (rec && rec.google_etag && rec.google_etag === ge.etag) continue; // ja el coneixem (eco nostre)

      if (ge.recurringEventId) {
        const masterRec = records.get(ge.recurringEventId);
        const master = masterRec?.event_id ? events.get(masterRec.event_id) : undefined;
        if (!master || !ge.originalStartTime) continue;
        const key = occurrenceKeyFromGoogle(ge.originalStartTime);
        const id = exceptionId(master.id, key);
        const prev = exceptions.get(id);
        let row: EventException;
        if (ge.status === "cancelled") {
          row = { ...(prev ?? blankException(userId, master.id, key)), id, cancelled: true, deleted_at: null, updated_at: stamp(prev?.updated_at) };
        } else {
          const m = eventFromGoogle(ge, master.timezone || tz);
          if (!m) continue;
          row = {
            ...(prev ?? blankException(userId, master.id, key)),
            id,
            cancelled: false,
            deleted_at: null,
            title: m.fields.title,
            description: m.fields.description,
            location: m.fields.location,
            all_day: m.fields.all_day,
            start_at: m.fields.start_at,
            end_at: m.fields.end_at,
            start_date: m.fields.start_date,
            end_date: m.fields.end_date,
            updated_at: stamp(prev?.updated_at),
          };
        }
        if (prev && rec && fingerprint(prev) !== rec.local_fingerprint && Date.parse(prev.updated_at) > Date.parse(ge.updated ?? "0")) {
          result.conflicts++;
          continue;
        }
        exceptions.set(id, row);
        upsertExceptions.push(row);
        touchedLocally.add(id);
        await saveRecord({ event_id: master.id, exception_id: id, google_event_id: ge.id, google_etag: ge.etag ?? null, local_fingerprint: fingerprint(row) });
        result.pulled++;
        continue;
      }

      const localId = rec?.event_id ?? ge.extendedProperties?.private?.tempoId;
      const local = localId ? events.get(localId) : undefined;

      if (ge.status === "cancelled") {
        if (local && !local.deleted_at) {
          const del = { ...local, deleted_at: new Date().toISOString(), updated_at: stamp(local.updated_at) };
          events.set(local.id, del);
          upsertEvents.push(del);
          touchedLocally.add(local.id);
          result.deleted++;
        }
        if (rec) {
          await sb.from("google_sync_records").delete().eq("id", rec.id);
          records.delete(ge.id);
          if (rec.event_id) recByEvent.delete(rec.event_id);
        }
        continue;
      }

      const mapped = eventFromGoogle(ge, tz);
      if (!mapped) continue;
      let row: EventRow;
      if (local) {
        const localChanged = !rec || fingerprint(local) !== rec.local_fingerprint;
        if (localChanged && rec && Date.parse(local.updated_at) > Date.parse(ge.updated ?? "0")) {
          result.conflicts++; // guanya el canvi local; es pujarà a la fase 2
          continue;
        }
        if (local.deleted_at && rec) {
          continue; // eliminat localment: la fase 2 l'eliminarà de Google
        }
        row = { ...local, ...mapped.fields, deleted_at: null, updated_at: stamp(local.updated_at) };
      } else {
        const now = new Date().toISOString();
        row = {
          id: uuid(),
          user_id: userId,
          calendar_id: profile?.default_calendar_id ?? null,
          category_id: null,
          series_parent_id: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          ...mapped.fields,
        };
      }
      events.set(row.id, row);
      upsertEvents.push(row);
      touchedLocally.add(row.id);
      // EXDATE → excepcions cancel·lades
      for (const key of mapped.exdates) {
        const id = exceptionId(row.id, key);
        const prev = exceptions.get(id);
        if (prev?.cancelled && !prev.deleted_at) continue;
        const x = { ...(prev ?? blankException(userId, row.id, key)), id, cancelled: true, deleted_at: null, updated_at: stamp(prev?.updated_at) };
        exceptions.set(id, x);
        upsertExceptions.push(x);
        touchedLocally.add(id);
      }
      await saveRecord({ id: rec?.id, event_id: row.id, exception_id: null, google_event_id: ge.id, google_etag: ge.etag ?? null, local_fingerprint: fingerprint(row) });
      result.pulled++;
    }

    if (upsertEvents.length) {
      const { error } = await sb.from("events").upsert(upsertEvents.map(strip), { onConflict: "id" });
      if (error) throw new HttpError(500, error.message);
    }
    if (upsertExceptions.length) {
      const { error } = await sb.from("event_exceptions").upsert(upsertExceptions.map(strip), { onConflict: "id" });
      if (error) throw new HttpError(500, error.message);
    }

    // ─────────────── 2. PUSH ───────────────
    for (const ev of events.values()) {
      if (touchedLocally.has(ev.id)) continue;
      const rec = recByEvent.get(ev.id);
      const fp = fingerprint(ev);
      if (ev.deleted_at) {
        if (rec) {
          await g.req("DELETE", `/events/${encodeURIComponent(rec.google_event_id)}`);
          await sb.from("google_sync_records").delete().eq("id", rec.id);
          recByEvent.delete(ev.id);
          result.deleted++;
        }
        continue;
      }
      if (!rec) {
        // Només s'exporten esdeveniments posteriors a fa un any (com la importació)
        const ref = ev.all_day ? ev.end_date ?? ev.start_date : ev.end_at ?? ev.start_at;
        if (!ev.rrule && ref && Date.parse(ref) < Date.now() - 365 * 86400000) continue;
        const res = await g.req<GEvent>("POST", "/events", eventToGoogle(ev));
        if (res.data?.id) {
          await saveRecord({ event_id: ev.id, exception_id: null, google_event_id: res.data.id, google_etag: res.data.etag ?? null, local_fingerprint: fp });
          result.pushed++;
        }
        continue;
      }
      if (fp !== rec.local_fingerprint) {
        const res = await g.req<GEvent>("PATCH", `/events/${encodeURIComponent(rec.google_event_id)}`, eventToGoogle(ev));
        if (res.status === 404 || res.status === 410) {
          // eliminat a Google mentrestant: el tornem a crear
          const created = await g.req<GEvent>("POST", "/events", eventToGoogle(ev));
          if (created.data?.id) {
            await sb.from("google_sync_records").delete().eq("id", rec.id);
            await saveRecord({ event_id: ev.id, exception_id: null, google_event_id: created.data.id, google_etag: created.data.etag ?? null, local_fingerprint: fp });
          }
        } else if (res.data) {
          await saveRecord({ id: rec.id, event_id: ev.id, exception_id: null, google_event_id: rec.google_event_id, google_etag: res.data.etag ?? null, local_fingerprint: fp });
        }
        result.pushed++;
      }
    }

    // Excepcions d'esdeveniments ja vinculats
    for (const x of exceptions.values()) {
      if (touchedLocally.has(x.id)) continue;
      const master = events.get(x.event_id);
      const masterRec = master ? recByEvent.get(master.id) : undefined;
      if (!master || !masterRec || master.deleted_at || !master.rrule) continue;
      const rec = recByException.get(x.id);
      const fp = fingerprint(x);
      if (rec && rec.local_fingerprint === fp) continue;
      if (!rec && x.deleted_at) continue;
      const gid = rec?.google_event_id ?? instanceId(masterRec.google_event_id, x.occurrence_key, master.all_day);
      const body = x.deleted_at ? restoreBody(master, x) : exceptionToGoogle(master, x);
      const res = await g.req<GEvent>("PATCH", `/events/${encodeURIComponent(gid)}`, body);
      if (res.status === 404 || res.status === 410) continue;
      await saveRecord({ id: rec?.id, event_id: master.id, exception_id: x.id, google_event_id: gid, google_etag: res.data?.etag ?? null, local_fingerprint: fp });
      result.pushed++;
    }

    await sb
      .from("google_integrations")
      .update({ sync_token: nextSyncToken ?? syncToken, last_synced_at: startedAt, last_error: null, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("google_integrations").update({ last_error: msg.slice(0, 500) }).eq("user_id", userId);
    throw e;
  }
}

function blankException(userId: string, eventId: string, key: string): EventException {
  const now = new Date().toISOString();
  return {
    id: exceptionId(eventId, key),
    user_id: userId,
    event_id: eventId,
    occurrence_key: key,
    cancelled: false,
    title: null,
    description: null,
    location: null,
    category_id: null,
    all_day: null,
    start_at: null,
    end_at: null,
    start_date: null,
    end_date: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

/** Quan una excepció local es desfà, l'ocurrència torna als valors de la sèrie */
function restoreBody(master: EventRow, x: EventException): Partial<GEvent> {
  const tz = master.timezone || "UTC";
  if (master.all_day) {
    const len = master.end_date && master.start_date ? Math.round((Date.parse(master.end_date) - Date.parse(master.start_date)) / 86400000) : 0;
    const end = new Date(`${x.occurrence_key}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + len + 1);
    return { status: "confirmed", summary: master.title, start: { date: x.occurrence_key }, end: { date: end.toISOString().slice(0, 10) } };
  }
  const dur = master.end_at ? Date.parse(master.end_at) - Date.parse(master.start_at!) : 0;
  const s = new Date(x.occurrence_key);
  return { status: "confirmed", summary: master.title, start: { dateTime: s.toISOString(), timeZone: tz }, end: { dateTime: new Date(s.getTime() + dur).toISOString(), timeZone: tz } };
}

function strip<T extends object>(row: T): T {
  const r = { ...row } as Record<string, unknown>;
  delete r.server_updated_at;
  return r as T;
}
