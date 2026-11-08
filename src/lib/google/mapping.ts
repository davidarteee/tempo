/**
 * Conversió entre esdeveniments de Tempo i de Google Calendar (API v3).
 * Les regles RRULE es comparteixen; només cal traduir UNTIL entre "hora de paret"
 * (Tempo) i UTC (Google).
 */
import type { EventException, EventRow } from "../types";
import { instantToWall, wallToInstant } from "../time/tz";

export interface GDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GEvent {
  id: string;
  etag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: GDateTime;
  end?: GDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GDateTime;
  updated?: string;
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
}

const ALL_DAY_BASE = 9 * 60;

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function stampUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function parseStamp(s: string): Date {
  // YYYYMMDD o YYYYMMDDTHHMMSS(Z)
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59, m[6] ? +m[6] : 59));
}

/** RRULE de Tempo → Google (UNTIL en UTC o en data per a tot el dia) */
export function ruleToGoogle(rule: string, allDay: boolean, tz: string): string {
  return `RRULE:${rule.replace(/^RRULE:/i, "").replace(/UNTIL=([0-9TZ]+)/, (_, u: string) => {
    const wall = parseStamp(u);
    return allDay ? `UNTIL=${wall.toISOString().slice(0, 10).replace(/-/g, "")}` : `UNTIL=${stampUtc(wallToInstant(wall, tz))}`;
  })}`;
}

/** RRULE de Google → Tempo (UNTIL en hora de paret flotant) */
export function ruleFromGoogle(recurrence: string[] | undefined, allDay: boolean, tz: string): { rrule: string | null; exdates: string[] } {
  if (!recurrence?.length) return { rrule: null, exdates: [] };
  const rr = recurrence.find((r) => r.startsWith("RRULE:"));
  const exdates: string[] = [];
  for (const line of recurrence.filter((r) => r.startsWith("EXDATE"))) {
    const [, values] = line.split(":");
    const lineTz = line.match(/TZID=([^;:]+)/)?.[1];
    for (const v of values?.split(",") ?? []) {
      if (allDay || /^\d{8}$/.test(v)) exdates.push(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`);
      else {
        const wall = parseStamp(v);
        const inst = v.endsWith("Z") ? wall : wallToInstant(wall, lineTz ?? tz);
        exdates.push(inst.toISOString());
      }
    }
  }
  if (!rr) return { rrule: null, exdates };
  const body = rr.slice(6).replace(/UNTIL=([0-9TZ]+)/, (_, u: string) => {
    const d = parseStamp(u);
    const wall = allDay || !u.includes("T") ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59)) : instantToWall(d, tz);
    return `UNTIL=${stampUtc(wall)}`;
  });
  return { rrule: body, exdates };
}

export function eventToGoogle(ev: EventRow): Partial<GEvent> {
  const tz = ev.timezone || "UTC";
  const g: Partial<GEvent> = {
    summary: ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    extendedProperties: { private: { tempoId: ev.id } },
  };
  if (ev.all_day) {
    g.start = { date: ev.start_date! };
    g.end = { date: addDays(ev.end_date ?? ev.start_date!, 1) };
  } else {
    g.start = { dateTime: ev.start_at!, timeZone: tz };
    g.end = { dateTime: ev.end_at ?? ev.start_at!, timeZone: tz };
    g.reminders = { useDefault: false, overrides: (ev.reminders ?? []).slice(0, 5).map((m) => ({ method: "popup", minutes: m })) };
  }
  g.recurrence = ev.rrule ? [ruleToGoogle(ev.rrule, ev.all_day, tz)] : [];
  return g;
}

export type MappedEvent = Pick<EventRow, "title" | "description" | "location" | "all_day" | "start_at" | "end_at" | "start_date" | "end_date" | "timezone" | "rrule" | "reminders">;

export function eventFromGoogle(g: GEvent, fallbackTz: string): { fields: MappedEvent; exdates: string[] } | null {
  if (!g.start) return null;
  const allDay = !!g.start.date;
  const tz = g.start.timeZone || fallbackTz || "UTC";
  const { rrule, exdates } = ruleFromGoogle(g.recurrence, allDay, tz);
  const reminders = g.reminders?.useDefault
    ? [allDay ? 0 : 10]
    : (g.reminders?.overrides ?? [])
        .map((o) => (allDay ? o.minutes + ALL_DAY_BASE : o.minutes))
        .filter((m) => m >= 0);
  const fields: MappedEvent = {
    title: (g.summary ?? "").trim().slice(0, 300) || "(Sense títol)",
    description: g.description ?? null,
    location: g.location ?? null,
    all_day: allDay,
    start_at: allDay ? null : new Date(g.start.dateTime!).toISOString(),
    end_at: allDay ? null : g.end?.dateTime ? new Date(g.end.dateTime).toISOString() : null,
    start_date: allDay ? g.start.date! : null,
    end_date: allDay ? addDays(g.end?.date ?? addDays(g.start.date!, 1), -1) : null,
    timezone: tz,
    rrule,
    reminders: Array.from(new Set(reminders)).sort((a, b) => a - b),
  };
  if (fields.all_day && fields.end_date! < fields.start_date!) fields.end_date = fields.start_date;
  if (!fields.all_day && fields.end_at && fields.end_at < fields.start_at!) fields.end_at = fields.start_at;
  return { fields, exdates };
}

/** Clau d'ocurrència de Tempo a partir de l'originalStartTime de Google */
export function occurrenceKeyFromGoogle(o: GDateTime): string {
  if (o.date) return o.date;
  return new Date(o.dateTime!).toISOString();
}

/** Identificador d'instància de Google a partir de la clau d'ocurrència */
export function instanceId(googleMasterId: string, occurrenceKey: string, allDay: boolean): string {
  if (allDay) return `${googleMasterId}_${occurrenceKey.replace(/-/g, "")}`;
  return `${googleMasterId}_${stampUtc(new Date(occurrenceKey))}`;
}

export function exceptionToGoogle(master: EventRow, x: EventException): Partial<GEvent> {
  if (x.cancelled) return { status: "cancelled" };
  const tz = master.timezone || "UTC";
  const allDay = x.all_day ?? master.all_day;
  const g: Partial<GEvent> = {
    status: "confirmed",
    summary: x.title ?? master.title,
    description: x.description ?? master.description ?? "",
    location: x.location ?? master.location ?? "",
  };
  if (allDay) {
    const s = x.start_date ?? x.occurrence_key.slice(0, 10);
    g.start = { date: s };
    g.end = { date: addDays(x.end_date ?? s, 1) };
  } else if (x.start_at) {
    g.start = { dateTime: x.start_at, timeZone: tz };
    g.end = { dateTime: x.end_at ?? x.start_at, timeZone: tz };
  }
  return g;
}

export function fingerprint(row: object): string {
  const r = row as Record<string, unknown>;
  const keys = ["title", "description", "location", "all_day", "start_at", "end_at", "start_date", "end_date", "rrule", "reminders", "deleted_at", "cancelled"];
  return JSON.stringify(keys.map((k) => {
    const v = r[k];
    if ((k === "start_at" || k === "end_at") && typeof v === "string") return new Date(v).toISOString();
    if (k === "deleted_at") return !!v;
    return v ?? null;
  }));
}
