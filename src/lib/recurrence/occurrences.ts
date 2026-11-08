/**
 * Motor d'ocurrències: converteix esdeveniments, tasques i les seves excepcions en
 * CalendarItem concrets per a un interval de temps. Codi pur i isomòrfic
 * (el fan servir la interfície i el servei de recordatoris del servidor).
 */
import type { CalendarItem, Category, EventException, EventRow, Task, TaskException } from "../types";
import { expandWall, isFirstOccurrence } from "./rrule";
import { instantToWall, wallDateKey, wallFromParts, wallToInstant } from "../time/tz";

export const DEFAULT_COLOR = "#8E8E93";
const DAY = 86400000;

export interface Dataset {
  events: EventRow[];
  eventExceptions: Map<string, Map<string, EventException>>;
  tasks: Task[];
  taskExceptions: Map<string, Map<string, TaskException>>;
  categories: Map<string, Category>;
}

export function groupExceptions<T extends { deleted_at: string | null; occurrence_key: string }>(
  rows: T[],
  parentKey: (r: T) => string,
): Map<string, Map<string, T>> {
  const out = new Map<string, Map<string, T>>();
  for (const r of rows) {
    if (r.deleted_at) continue;
    const p = parentKey(r);
    let m = out.get(p);
    if (!m) out.set(p, (m = new Map()));
    m.set(r.occurrence_key, r);
  }
  return out;
}

function keyToWall(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return wallFromParts(y, m - 1, d);
}

function addDayKey(k: string, n: number): string {
  return wallDateKey(new Date(keyToWall(k).getTime() + n * DAY));
}

function dayDiff(a: string, b: string): number {
  return Math.round((keyToWall(b).getTime() - keyToWall(a).getTime()) / DAY);
}

/** Mitjanit local (navegador) d'una clau de dia */
function localMidnight(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function colorFor(ds: Dataset, categoryId: string | null) {
  if (!categoryId) return DEFAULT_COLOR;
  const c = ds.categories.get(categoryId);
  return c && !c.deleted_at ? c.color : DEFAULT_COLOR;
}

function validCategory(ds: Dataset, id: string | null) {
  if (!id) return null;
  const c = ds.categories.get(id);
  return c && !c.deleted_at ? id : null;
}

export interface Range {
  from: Date; // instant inclusiu
  to: Date; // instant exclusiu
}

export function dayRange(fromDay: string, toDayInclusive: string): Range {
  return { from: localMidnight(fromDay), to: localMidnight(addDayKey(toDayInclusive, 1)) };
}

// ───────────────────────── Esdeveniments ─────────────────────────

export function expandEvent(ds: Dataset, ev: EventRow, range: Range): CalendarItem[] {
  if (ev.deleted_at) return [];
  const exc = ds.eventExceptions.get(ev.id);
  const out: CalendarItem[] = [];
  const rangeFromDay = localDayKey(range.from);
  const rangeToDay = localDayKey(new Date(range.to.getTime() - 1));

  const push = (item: CalendarItem) => {
    if (item.allDay) {
      if (item.startDay <= rangeToDay && item.endDay >= rangeFromDay) out.push(item);
    } else {
      const overlaps = item.start < range.to && (item.end > range.from || (item.end.getTime() === item.start.getTime() && item.start >= range.from));
      if (overlaps) out.push(item);
    }
  };

  const base = (occKey: string | null, first: boolean) => ({
    kind: "event" as const,
    sourceId: ev.id,
    occurrenceKey: occKey,
    recurring: !!ev.rrule,
    completed: false,
    isFirstOccurrence: first,
    key: `e:${ev.id}:${occKey ?? ""}`,
  });

  const applyException = (item: CalendarItem, x: EventException | undefined): CalendarItem | null => {
    if (!x) return item;
    if (x.cancelled) return null;
    const r = { ...item };
    if (x.title != null) r.title = x.title;
    if (x.location != null) r.location = x.location;
    if (x.category_id != null) {
      r.categoryId = validCategory(ds, x.category_id);
      r.color = colorFor(ds, r.categoryId);
    }
    if (x.all_day != null) r.allDay = x.all_day;
    if (r.allDay && x.start_date) {
      r.startDay = x.start_date;
      r.endDay = x.end_date ?? x.start_date;
      r.start = localMidnight(r.startDay);
      r.end = localMidnight(addDayKey(r.endDay, 1));
    } else if (!r.allDay && x.start_at) {
      r.start = new Date(x.start_at);
      r.end = x.end_at ? new Date(x.end_at) : new Date(x.start_at);
      r.startDay = localDayKey(r.start);
      r.endDay = localDayKey(new Date(Math.max(r.start.getTime(), r.end.getTime() - 1)));
    }
    return r;
  };

  const categoryId = validCategory(ds, ev.category_id);
  const common = {
    title: ev.title,
    location: ev.location,
    categoryId,
    color: colorFor(ds, categoryId),
  };

  if (ev.all_day) {
    if (!ev.start_date) return [];
    const span = Math.max(0, dayDiff(ev.start_date, ev.end_date ?? ev.start_date));
    const mk = (startKey: string, occKey: string | null, first: boolean): CalendarItem => {
      const endKey = addDayKey(startKey, span);
      return {
        ...base(occKey, first),
        ...common,
        allDay: true,
        startDay: startKey,
        endDay: endKey,
        start: localMidnight(startKey),
        end: localMidnight(addDayKey(endKey, 1)),
      };
    };
    if (!ev.rrule) {
      push(mk(ev.start_date, null, true));
      return out;
    }
    const dt = keyToWall(ev.start_date);
    const from = keyToWall(addDayKey(rangeFromDay, -span - 7));
    const to = keyToWall(addDayKey(rangeToDay, 7));
    const occs = expandWall(ev.rrule, dt, from, to);
    for (const w of occs) {
      const k = wallDateKey(w);
      const item = applyException(mk(k, k, w.getTime() === dt.getTime()), exc?.get(k));
      if (item) push(item);
    }
    return out;
  }

  if (!ev.start_at) return [];
  const start = new Date(ev.start_at);
  const end = ev.end_at ? new Date(ev.end_at) : start;
  const dur = Math.max(0, end.getTime() - start.getTime());
  const mk = (s: Date, occKey: string | null, first: boolean): CalendarItem => {
    const e = new Date(s.getTime() + dur);
    return {
      ...base(occKey, first),
      ...common,
      allDay: false,
      start: s,
      end: e,
      startDay: localDayKey(s),
      endDay: localDayKey(new Date(Math.max(s.getTime(), e.getTime() - 1))),
    };
  };
  if (!ev.rrule) {
    push(mk(start, null, true));
    return out;
  }
  const tz = ev.timezone || "UTC";
  const dtWall = instantToWall(start, tz);
  const fromWall = instantToWall(new Date(range.from.getTime() - dur - 7 * DAY), tz);
  const toWall = instantToWall(new Date(range.to.getTime() + 7 * DAY), tz);
  const occs = expandWall(ev.rrule, dtWall, fromWall, toWall);
  for (const w of occs) {
    const s = wallToInstant(w, tz);
    const k = s.toISOString();
    const item = applyException(mk(s, k, w.getTime() === dtWall.getTime()), exc?.get(k));
    if (item) push(item);
  }
  return out;
}

// ───────────────────────── Tasques ─────────────────────────

export function taskOccurrenceStart(task: Task, dateKey: string, time: string | null): { start: Date; end: Date } {
  if (!time) {
    const s = localMidnight(dateKey);
    return { start: s, end: localMidnight(addDayKey(dateKey, 1)) };
  }
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = dateKey.split("-").map(Number);
  const s = wallToInstant(wallFromParts(y, mo - 1, d, h, m), task.timezone || "UTC");
  return { start: s, end: new Date(s.getTime() + task.duration_minutes * 60000) };
}

export function expandTask(ds: Dataset, task: Task, range: Range): CalendarItem[] {
  if (task.deleted_at || !task.scheduled_date) return [];
  const out: CalendarItem[] = [];
  const rangeFromDay = localDayKey(range.from);
  const rangeToDay = localDayKey(new Date(range.to.getTime() - 1));
  const categoryId = validCategory(ds, task.category_id);
  const exc = task.rrule ? ds.taskExceptions.get(task.id) : undefined;

  const mk = (dateKey: string, time: string | null, occKey: string | null, completed: boolean, title: string, first: boolean): CalendarItem => {
    const { start, end } = taskOccurrenceStart(task, dateKey, time);
    return {
      key: `t:${task.id}:${occKey ?? ""}`,
      kind: "task",
      sourceId: task.id,
      occurrenceKey: occKey,
      recurring: !!task.rrule,
      title,
      location: null,
      categoryId,
      color: colorFor(ds, categoryId),
      allDay: !time,
      start,
      end,
      startDay: time ? localDayKey(start) : dateKey,
      endDay: time ? localDayKey(start) : dateKey,
      completed,
      isFirstOccurrence: first,
    };
  };

  const inRange = (it: CalendarItem) => (it.allDay ? it.startDay >= rangeFromDay && it.startDay <= rangeToDay : it.start < range.to && it.end > range.from);

  if (!task.rrule) {
    const it = mk(task.scheduled_date, task.scheduled_time, null, !!task.completed_at, task.title, true);
    if (inRange(it)) out.push(it);
    return out;
  }
  const dt = keyToWall(task.scheduled_date);
  const occs = expandWall(task.rrule, dt, keyToWall(addDayKey(rangeFromDay, -7)), keyToWall(addDayKey(rangeToDay, 7)));
  for (const w of occs) {
    const k = wallDateKey(w);
    const x = exc?.get(k);
    if (x?.cancelled) continue;
    const date = x?.scheduled_date ?? k;
    const time = x?.clear_time ? null : (x?.scheduled_time ?? task.scheduled_time);
    const it = mk(date, time, k, !!x?.completed_at, x?.title ?? task.title, w.getTime() === dt.getTime());
    if (inRange(it)) out.push(it);
  }
  return out;
}

export function buildItems(ds: Dataset, range: Range, opts: { includeEvents?: boolean; includeTasks?: boolean } = {}): CalendarItem[] {
  const items: CalendarItem[] = [];
  if (opts.includeEvents !== false) for (const ev of ds.events) items.push(...expandEvent(ds, ev, range));
  if (opts.includeTasks !== false) for (const t of ds.tasks) items.push(...expandTask(ds, t, range));
  return items.sort(compareItems);
}

export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.allDay) {
    if (a.startDay !== b.startDay) return a.startDay < b.startDay ? -1 : 1;
    const la = dayDiff(a.startDay, a.endDay);
    const lb = dayDiff(b.startDay, b.endDay);
    if (la !== lb) return lb - la;
  } else if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
  if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** Agrupa per dia local (un element de diversos dies apareix a cada dia) */
export function itemsByDay(items: CalendarItem[], fromDay: string, toDay: string): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const it of items) {
    let k = it.startDay < fromDay ? fromDay : it.startDay;
    const last = it.endDay > toDay ? toDay : it.endDay;
    let guard = 0;
    while (k <= last && guard++ < 400) {
      let arr = map.get(k);
      if (!arr) map.set(k, (arr = []));
      arr.push(it);
      k = addDayKey(k, 1);
    }
  }
  return map;
}

export const occurrenceUtils = { keyToWall, addDayKey, dayDiff, localMidnight, localDayKey };
export { isFirstOccurrence };
