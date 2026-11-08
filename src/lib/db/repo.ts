/**
 * Repositori de mutacions. Cada operació:
 *   1. escriu a IndexedDB dins d'una transacció (UI instantània / optimista),
 *   2. afegeix una entrada a la cua de sortida (outbox),
 *   3. avisa el motor de sincronització.
 * Totes les operacions sobre sèries recurrents (només aquesta / aquesta i futures / totes)
 * són aquí, de manera que la interfície no ha de conèixer els detalls.
 */
import { db, table } from "./local";
import { exceptionId, uuid } from "./ids";
import { getUserId, LOCAL_USER } from "../session";
import type { CalendarItem, Category, EditScope, EventException, EventRow, Subtask, SyncTable, Task, TaskException } from "../types";
import { endRuleBefore, splitRule } from "../recurrence/rrule";
import { instantToWall, localTimeZone, wallDateKey } from "../time/tz";
import { occurrenceUtils } from "../recurrence/occurrences";

type AnyRow = { id: string; updated_at: string; deleted_at: string | null; user_id: string; created_at: string };

let notify: () => void = () => {};
export function onLocalChange(cb: () => void) {
  notify = cb;
}

let lastStamp = 0;
/** Marca de temps monòtona (necessària per a Last-Write-Wins) */
function stamp(prev?: string | null): string {
  let t = Date.now();
  if (t <= lastStamp) t = lastStamp + 1;
  if (prev) {
    const p = Date.parse(prev);
    if (t <= p) t = p + 1;
  }
  lastStamp = t;
  return new Date(t).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Write = { table: SyncTable; row: AnyRow & Record<string, any> };

/** Escriu files i les posa a la cua de sincronització de manera atòmica */
async function commit(writes: Write[]) {
  if (!writes.length) return;
  const d = db();
  const tables = Array.from(new Set(writes.map((w) => w.table))).map((t) => d[t]);
  const queue = getUserId() !== LOCAL_USER; // en mode local no hi ha res a sincronitzar
  await d.transaction("rw", [...tables, d.outbox], async () => {
    for (const w of writes) {
      await table(w.table).put(w.row);
      if (!queue) continue;
      const existing = await d.outbox.where("[table+row_id]").equals([w.table, w.row.id]).first();
      if (!existing) {
        await d.outbox.add({ table: w.table, row_id: w.row.id, created_at: Date.now(), attempts: 0, last_error: null, dead: 0 });
      } else if (existing.dead) {
        await d.outbox.update(existing.seq!, { dead: 0, attempts: 0, last_error: null });
      }
    }
  });
  notify();
}

function base(prev?: AnyRow | null) {
  const now = stamp(prev?.updated_at);
  return {
    user_id: prev?.user_id ?? getUserId(),
    created_at: prev?.created_at ?? now,
    updated_at: now,
    deleted_at: null as string | null,
  };
}

function touch<T extends AnyRow>(row: T, patch: Partial<T> | Record<string, unknown>): T {
  return { ...row, ...patch, updated_at: stamp(row.updated_at) };
}

function softDelete<T extends AnyRow>(row: T): T {
  return { ...row, deleted_at: new Date().toISOString(), updated_at: stamp(row.updated_at) };
}

// ───────────────────────── Desfer ─────────────────────────

export type UndoToken = Write[];

async function snapshot(tableName: SyncTable, ids: string[]): Promise<Write[]> {
  const rows = await table(tableName).bulkGet(ids);
  return rows.filter(Boolean).map((r) => ({ table: tableName, row: { ...(r as AnyRow) } }));
}

export async function undo(token: UndoToken) {
  await commit(token.map((w) => ({ table: w.table, row: { ...w.row, updated_at: stamp(w.row.updated_at) } })));
}

// ───────────────────────── Categories ─────────────────────────

export const CATEGORY_COLORS = [
  "#FF3B30", "#FF9F0A", "#FFCC00", "#30D158", "#00C7BE", "#40C8E0",
  "#0A84FF", "#5E5CE6", "#AF52DE", "#FF2D55", "#A2845E", "#8E8E93",
];

export async function createCategory(name: string, color: string): Promise<Category> {
  const all = await db().categories.toArray();
  const row: Category = {
    id: uuid(),
    ...base(),
    name: name.trim().slice(0, 60),
    color,
    sort_order: all.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1,
  };
  await commit([{ table: "categories", row }]);
  return row;
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, "name" | "color" | "sort_order">>) {
  const row = await db().categories.get(id);
  if (!row) return;
  await commit([{ table: "categories", row: touch(row, { ...patch, name: patch.name?.trim().slice(0, 60) ?? row.name }) }]);
}

/** Elimina una categoria reassignant els elements a una altra (o deixant-los sense categoria) */
export async function deleteCategory(id: string, reassignTo: string | null) {
  const d = db();
  const row = await d.categories.get(id);
  if (!row) return;
  const writes: Write[] = [];
  const [events, tasks, excs] = await Promise.all([
    d.events.filter((e) => e.category_id === id).toArray(),
    d.tasks.filter((t) => t.category_id === id).toArray(),
    d.event_exceptions.filter((x) => x.category_id === id).toArray(),
  ]);
  for (const e of events) writes.push({ table: "events", row: touch(e, { category_id: reassignTo }) });
  for (const t of tasks) writes.push({ table: "tasks", row: touch(t, { category_id: reassignTo }) });
  for (const x of excs) writes.push({ table: "event_exceptions", row: touch(x, { category_id: reassignTo }) });
  writes.push({ table: "categories", row: softDelete(row) });
  await commit(writes);
}

export async function countCategoryUsage(id: string) {
  const d = db();
  const [e, t] = await Promise.all([
    d.events.filter((x) => x.category_id === id && !x.deleted_at).count(),
    d.tasks.filter((x) => x.category_id === id && !x.deleted_at).count(),
  ]);
  return { events: e, tasks: t };
}

// ───────────────────────── Esdeveniments ─────────────────────────

export interface EventDraft {
  title: string;
  description: string | null;
  location: string | null;
  category_id: string | null;
  all_day: boolean;
  start: Date; // amb hora: instant
  end: Date | null;
  startDay: string; // tot el dia
  endDay: string;
  rrule: string | null;
  reminders: number[];
}

function draftToEventFields(d: EventDraft) {
  return {
    title: d.title.trim().slice(0, 300) || "Sense títol",
    description: d.description?.trim() || null,
    location: d.location?.trim() || null,
    category_id: d.category_id,
    all_day: d.all_day,
    start_at: d.all_day ? null : d.start.toISOString(),
    end_at: d.all_day ? null : d.end && d.end > d.start ? d.end.toISOString() : null,
    start_date: d.all_day ? d.startDay : null,
    end_date: d.all_day ? (d.endDay >= d.startDay ? d.endDay : d.startDay) : null,
    rrule: d.rrule,
    reminders: [...new Set(d.reminders)].sort((a, b) => a - b),
  };
}

export async function createEvent(draft: EventDraft): Promise<EventRow> {
  const calendar = await db().meta.get("default_calendar_id");
  const row: EventRow = {
    id: uuid(),
    ...base(),
    calendar_id: (calendar?.value as string) ?? null,
    timezone: localTimeZone(),
    series_parent_id: null,
    ...draftToEventFields(draft),
  };
  await commit([{ table: "events", row }]);
  return row;
}

/** Esborrany complet d'una ocurrència concreta (aplicant-hi l'excepció si n'hi ha) */
export async function eventDraftFor(item: CalendarItem): Promise<{ master: EventRow; draft: EventDraft } | null> {
  const master = await db().events.get(item.sourceId);
  if (!master) return null;
  const x = item.occurrenceKey ? await db().event_exceptions.get(exceptionId(master.id, item.occurrenceKey)) : undefined;
  const valid = x && !x.deleted_at ? x : undefined;
  return {
    master,
    draft: {
      title: item.title,
      description: valid?.description ?? master.description,
      location: item.location,
      category_id: item.categoryId,
      all_day: item.allDay,
      start: item.start,
      end: item.allDay ? null : item.end,
      startDay: item.startDay,
      endDay: item.endDay,
      rrule: master.rrule,
      reminders: master.reminders ?? [],
    },
  };
}

function occStartWall(master: EventRow, occKey: string): Date {
  if (master.all_day) return occurrenceUtils.keyToWall(occKey);
  return instantToWall(new Date(occKey), master.timezone || "UTC");
}

function masterStartWall(master: EventRow): Date {
  if (master.all_day) return occurrenceUtils.keyToWall(master.start_date!);
  return instantToWall(new Date(master.start_at!), master.timezone || "UTC");
}

/** Desplaça claus d'ocurrència: ISO amb hora (ms) o dia (dies) */
function shiftKey(key: string, allDay: boolean, deltaMs: number, deltaDays: number): string {
  if (allDay) return occurrenceUtils.addDayKey(key, deltaDays);
  return new Date(Date.parse(key) + deltaMs).toISOString();
}

async function eventExceptionsOf(eventId: string) {
  return (await db().event_exceptions.where("event_id").equals(eventId).toArray()).filter((x) => !x.deleted_at);
}

/** Mou (re-clau) o copia excepcions entre sèries */
function rekeyEventExceptions(
  excs: EventException[],
  targetEventId: string,
  allDay: boolean,
  deltaMs: number,
  deltaDays: number,
  writes: Write[],
) {
  for (const x of excs) {
    const newKey = shiftKey(x.occurrence_key, allDay, deltaMs, deltaDays);
    if (newKey === x.occurrence_key && targetEventId === x.event_id) continue;
    writes.push({ table: "event_exceptions", row: softDelete(x) });
    const id = exceptionId(targetEventId, newKey);
    writes.push({
      table: "event_exceptions",
      row: { ...x, ...base(x), id, event_id: targetEventId, occurrence_key: newKey, created_at: x.created_at },
    });
  }
}

function exceptionFromDraft(master: EventRow, occKey: string, d: EventDraft, prev?: EventException): EventException {
  const f = draftToEventFields(d);
  return {
    ...(prev ?? {}),
    ...base(prev ?? null),
    id: exceptionId(master.id, occKey),
    event_id: master.id,
    occurrence_key: occKey,
    cancelled: false,
    title: f.title,
    description: f.description,
    location: f.location,
    category_id: f.category_id,
    all_day: f.all_day,
    start_at: f.start_at,
    end_at: f.end_at,
    start_date: f.start_date,
    end_date: f.end_date,
  } as EventException;
}

/**
 * Desa canvis d'un esdeveniment (o d'una ocurrència d'una sèrie).
 * `item` és l'ocurrència oberta a l'editor; `draft` el seu nou estat.
 */
export async function saveEvent(item: CalendarItem, draft: EventDraft, scope: EditScope) {
  const d = db();
  const master = await d.events.get(item.sourceId);
  if (!master) return;
  const writes: Write[] = [];

  if (!master.rrule || !item.occurrenceKey) {
    writes.push({ table: "events", row: touch(master, draftToEventFields(draft)) });
    await commit(writes);
    return;
  }

  const occKey = item.occurrenceKey;
  if (scope === "this") {
    const prev = await d.event_exceptions.get(exceptionId(master.id, occKey));
    writes.push({ table: "event_exceptions", row: exceptionFromDraft(master, occKey, draft, prev) });
    await commit(writes);
    return;
  }

  // Desplaçament de temps de l'ocurrència respecte al seu inici original
  const origStart = master.all_day ? occurrenceUtils.localMidnight(occKey) : new Date(occKey);
  const deltaMs = draft.all_day ? 0 : draft.start.getTime() - (master.all_day ? origStart.getTime() : origStart.getTime());
  const deltaDays = draft.all_day && master.all_day ? occurrenceUtils.dayDiff(occKey, draft.startDay) : 0;
  const typeChanged = draft.all_day !== master.all_day;

  const fields = draftToEventFields(draft);

  if (scope === "all" || item.isFirstOccurrence) {
    // Aplica el canvi a la sèrie sencera, desplaçant l'inici del màster
    const next: Partial<EventRow> = { ...fields };
    if (!typeChanged) {
      if (master.all_day) {
        const len = occurrenceUtils.dayDiff(draft.startDay, draft.endDay);
        next.start_date = occurrenceUtils.addDayKey(master.start_date!, deltaDays);
        next.end_date = occurrenceUtils.addDayKey(next.start_date, Math.max(0, len));
      } else {
        const s = new Date(Date.parse(master.start_at!) + deltaMs);
        next.start_at = s.toISOString();
        next.end_at = draft.end ? new Date(s.getTime() + (draft.end.getTime() - draft.start.getTime())).toISOString() : null;
      }
    } else {
      // Canvi entre "tot el dia" i "amb hora": la sèrie comença el dia del màster
      const masterDay = master.all_day ? master.start_date! : wallDateKey(masterStartWall(master));
      const dayShift = occurrenceUtils.dayDiff(master.all_day ? occKey : wallDateKey(occStartWall(master, occKey)), draft.startDay);
      const newDay = occurrenceUtils.addDayKey(masterDay, dayShift);
      if (draft.all_day) {
        next.start_date = newDay;
        next.end_date = occurrenceUtils.addDayKey(newDay, occurrenceUtils.dayDiff(draft.startDay, draft.endDay));
      } else {
        const s = new Date(draft.start);
        const nd = occurrenceUtils.localMidnight(newDay);
        s.setFullYear(nd.getFullYear(), nd.getMonth(), nd.getDate());
        next.start_at = s.toISOString();
        next.end_at = draft.end ? new Date(s.getTime() + (draft.end.getTime() - draft.start.getTime())).toISOString() : null;
      }
    }
    writes.push({ table: "events", row: touch(master, next) });
    const excs = await eventExceptionsOf(master.id);
    if (typeChanged) excs.forEach((x) => writes.push({ table: "event_exceptions", row: softDelete(x) }));
    else rekeyEventExceptions(excs, master.id, master.all_day, deltaMs, deltaDays, writes);
    // l'excepció de l'ocurrència editada ja no cal
    const own = excs.find((x) => x.occurrence_key === occKey);
    if (own && !typeChanged && deltaMs === 0 && deltaDays === 0) writes.push({ table: "event_exceptions", row: softDelete(own) });
    await commit(writes);
    return;
  }

  // scope === "future": divideix la sèrie
  const split = splitRule(master.rrule, masterStartWall(master), occStartWall(master, occKey));
  const newRule = draft.rrule === master.rrule ? split.after : draft.rrule;
  const newEvent: EventRow = {
    ...master,
    ...base(),
    id: uuid(),
    ...fields,
    rrule: newRule,
    series_parent_id: master.series_parent_id ?? master.id,
  };
  writes.push({ table: "events", row: touch(master, { rrule: split.before }) });
  writes.push({ table: "events", row: newEvent });
  const future = (await eventExceptionsOf(master.id)).filter((x) => x.occurrence_key >= occKey && x.occurrence_key !== occKey);
  if (typeChanged) future.forEach((x) => writes.push({ table: "event_exceptions", row: softDelete(x) }));
  else rekeyEventExceptions(future, newEvent.id, master.all_day, deltaMs, deltaDays, writes);
  const own = await d.event_exceptions.get(exceptionId(master.id, occKey));
  if (own && !own.deleted_at) writes.push({ table: "event_exceptions", row: softDelete(own) });
  await commit(writes);
}

export async function deleteEvent(item: CalendarItem, scope: EditScope): Promise<UndoToken> {
  const d = db();
  const master = await d.events.get(item.sourceId);
  if (!master) return [];
  const excs = await eventExceptionsOf(master.id);
  const undoToken = [...(await snapshot("events", [master.id])), ...(await snapshot("event_exceptions", excs.map((x) => x.id)))];
  const writes: Write[] = [];

  if (!master.rrule || !item.occurrenceKey || scope === "all" || (scope === "future" && item.isFirstOccurrence)) {
    writes.push({ table: "events", row: softDelete(master) });
    excs.forEach((x) => writes.push({ table: "event_exceptions", row: softDelete(x) }));
  } else if (scope === "this") {
    const id = exceptionId(master.id, item.occurrenceKey);
    const prev = await d.event_exceptions.get(id);
    undoToken.push(...(prev ? await snapshot("event_exceptions", [id]) : []));
    const row: EventException = {
      ...(prev ?? {
        title: null, description: null, location: null, category_id: null, all_day: null,
        start_at: null, end_at: null, start_date: null, end_date: null,
      }),
      ...base(prev ?? null),
      id,
      event_id: master.id,
      occurrence_key: item.occurrenceKey,
      cancelled: true,
    } as EventException;
    writes.push({ table: "event_exceptions", row });
    if (!prev) undoToken.push({ table: "event_exceptions", row: softDelete(row) });
  } else {
    const rule = endRuleBefore(master.rrule, masterStartWall(master), occStartWall(master, item.occurrenceKey));
    if (rule === null) writes.push({ table: "events", row: softDelete(master) });
    else writes.push({ table: "events", row: touch(master, { rrule: rule }) });
    excs.filter((x) => x.occurrence_key >= item.occurrenceKey!).forEach((x) => writes.push({ table: "event_exceptions", row: softDelete(x) }));
  }
  await commit(writes);
  return undoToken;
}

// ───────────────────────── Tasques ─────────────────────────

export interface TaskDraft {
  title: string;
  description: string | null;
  category_id: string | null;
  due_date: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null; // HH:MM
  duration_minutes: number;
  rrule: string | null;
  reminders: number[];
}

function normTime(t: string | null) {
  if (!t) return null;
  return t.length === 5 ? `${t}:00` : t;
}

function draftToTaskFields(d: TaskDraft) {
  const date = d.scheduled_date || null;
  return {
    title: d.title.trim().slice(0, 300) || "Sense títol",
    description: d.description?.trim() || null,
    category_id: d.category_id,
    due_date: d.due_date || null,
    scheduled_date: date,
    scheduled_time: date ? normTime(d.scheduled_time) : null,
    duration_minutes: Math.min(1440, Math.max(5, Math.round(d.duration_minutes || 30))),
    rrule: date ? d.rrule : null,
    reminders: date ? [...new Set(d.reminders)].sort((a, b) => a - b) : [],
  };
}

export async function createTask(draft: TaskDraft, subtasks: string[] = []): Promise<Task> {
  const row: Task = {
    id: uuid(),
    ...base(),
    timezone: localTimeZone(),
    completed_at: null,
    sort_order: -Date.now(),
    ...draftToTaskFields(draft),
  };
  const writes: Write[] = [{ table: "tasks", row }];
  subtasks.filter((s) => s.trim()).forEach((title, i) => {
    writes.push({ table: "task_subtasks", row: { id: uuid(), ...base(), task_id: row.id, title: title.trim(), done: false, sort_order: i } as Subtask });
  });
  await commit(writes);
  return row;
}

export async function taskDraftFor(taskId: string, occurrenceKey: string | null): Promise<{ task: Task; draft: TaskDraft } | null> {
  const task = await db().tasks.get(taskId);
  if (!task) return null;
  const x = occurrenceKey ? await db().task_exceptions.get(exceptionId(task.id, occurrenceKey)) : undefined;
  const ex = x && !x.deleted_at ? x : undefined;
  return {
    task,
    draft: {
      title: ex?.title ?? task.title,
      description: task.description,
      category_id: task.category_id,
      due_date: task.due_date,
      scheduled_date: ex?.scheduled_date ?? occurrenceKey ?? task.scheduled_date,
      scheduled_time: (ex?.clear_time ? null : (ex?.scheduled_time ?? task.scheduled_time))?.slice(0, 5) ?? null,
      duration_minutes: task.duration_minutes,
      rrule: task.rrule,
      reminders: task.reminders ?? [],
    },
  };
}

async function taskExceptionsOf(taskId: string) {
  return (await db().task_exceptions.where("task_id").equals(taskId).toArray()).filter((x) => !x.deleted_at);
}

export async function saveTask(taskId: string, occurrenceKey: string | null, draft: TaskDraft, scope: EditScope) {
  const d = db();
  const task = await d.tasks.get(taskId);
  if (!task) return;
  const fields = draftToTaskFields(draft);
  const writes: Write[] = [];

  if (!task.rrule || !occurrenceKey) {
    writes.push({ table: "tasks", row: touch(task, fields) });
    // si perd la recurrència, neteja excepcions
    if (task.rrule && !fields.rrule) (await taskExceptionsOf(task.id)).forEach((x) => writes.push({ table: "task_exceptions", row: softDelete(x) }));
    await commit(writes);
    return;
  }

  if (scope === "this") {
    const id = exceptionId(task.id, occurrenceKey);
    const prev = await d.task_exceptions.get(id);
    const row: TaskException = {
      ...(prev ?? { completed_at: null }),
      ...base(prev ?? null),
      id,
      task_id: task.id,
      occurrence_key: occurrenceKey,
      cancelled: false,
      title: fields.title !== task.title ? fields.title : null,
      scheduled_date: fields.scheduled_date && fields.scheduled_date !== occurrenceKey ? fields.scheduled_date : null,
      scheduled_time: fields.scheduled_time,
      clear_time: !fields.scheduled_time,
    } as TaskException;
    writes.push({ table: "task_exceptions", row });
    await commit(writes);
    return;
  }

  const deltaDays = fields.scheduled_date ? occurrenceUtils.dayDiff(occurrenceKey, fields.scheduled_date) : 0;
  const isFirst = occurrenceKey === task.scheduled_date;

  if (scope === "all" || isFirst) {
    const next = { ...fields };
    if (fields.scheduled_date) next.scheduled_date = occurrenceUtils.addDayKey(task.scheduled_date!, deltaDays);
    writes.push({ table: "tasks", row: touch(task, next) });
    const excs = await taskExceptionsOf(task.id);
    for (const x of excs) {
      if (!fields.scheduled_date) {
        writes.push({ table: "task_exceptions", row: softDelete(x) });
        continue;
      }
      // l'hora/títol de la sèrie s'apliquen a totes: neteja overrides d'aquests camps
      const cleaned = { scheduled_time: null, clear_time: false, title: null };
      if (deltaDays) {
        const nk = occurrenceUtils.addDayKey(x.occurrence_key, deltaDays);
        writes.push({ table: "task_exceptions", row: softDelete(x) });
        writes.push({ table: "task_exceptions", row: { ...x, ...base(x), ...cleaned, id: exceptionId(task.id, nk), occurrence_key: nk } });
      } else if (x.scheduled_time || x.clear_time || x.title) {
        writes.push({ table: "task_exceptions", row: touch(x, cleaned) });
      }
    }
    await commit(writes);
    return;
  }

  // "future": divideix la sèrie
  const split = splitRule(task.rrule, occurrenceUtils.keyToWall(task.scheduled_date!), occurrenceUtils.keyToWall(occurrenceKey));
  const newTask: Task = {
    ...task,
    ...base(),
    id: uuid(),
    ...fields,
    rrule: draft.rrule === task.rrule ? split.after : fields.rrule,
    completed_at: null,
  };
  writes.push({ table: "tasks", row: touch(task, { rrule: split.before }) });
  writes.push({ table: "tasks", row: newTask });
  const subs = (await d.task_subtasks.where("task_id").equals(task.id).toArray()).filter((s) => !s.deleted_at);
  subs.forEach((s, i) => writes.push({ table: "task_subtasks", row: { ...s, ...base(), id: uuid(), task_id: newTask.id, done: false, sort_order: i } }));
  const future = (await taskExceptionsOf(task.id)).filter((x) => x.occurrence_key >= occurrenceKey);
  for (const x of future) {
    writes.push({ table: "task_exceptions", row: softDelete(x) });
    if (x.occurrence_key === occurrenceKey) continue;
    const nk = occurrenceUtils.addDayKey(x.occurrence_key, deltaDays);
    writes.push({ table: "task_exceptions", row: { ...x, ...base(), id: exceptionId(newTask.id, nk), task_id: newTask.id, occurrence_key: nk } });
  }
  await commit(writes);
}

/** Marca/desmarca una tasca (o una ocurrència d'una tasca recurrent) com a feta */
export async function toggleTaskComplete(taskId: string, occurrenceKey: string | null, done?: boolean) {
  const d = db();
  const task = await d.tasks.get(taskId);
  if (!task) return;
  if (!task.rrule || !occurrenceKey) {
    const next = done ?? !task.completed_at;
    await commit([{ table: "tasks", row: touch(task, { completed_at: next ? new Date().toISOString() : null }) }]);
    return;
  }
  const id = exceptionId(task.id, occurrenceKey);
  const prev = await d.task_exceptions.get(id);
  const isDone = prev && !prev.deleted_at && !!prev.completed_at;
  const next = done ?? !isDone;
  const row: TaskException = {
    ...(prev && !prev.deleted_at
      ? prev
      : { cancelled: false, title: null, scheduled_date: null, scheduled_time: null, clear_time: false }),
    ...base(prev ?? null),
    id,
    task_id: task.id,
    occurrence_key: occurrenceKey,
    completed_at: next ? new Date().toISOString() : null,
  } as TaskException;
  await commit([{ table: "task_exceptions", row }]);
}

/** Assigna (o treu) una data/hora a una tasca. Per a ocurrències recurrents, només aquesta. */
export async function scheduleTask(taskId: string, occurrenceKey: string | null, date: string | null, time: string | null, scope: EditScope = "this") {
  const r = await taskDraftFor(taskId, occurrenceKey);
  if (!r) return;
  await saveTask(taskId, occurrenceKey, { ...r.draft, scheduled_date: date, scheduled_time: time }, r.task.rrule ? scope : "all");
}

export async function deleteTask(taskId: string, occurrenceKey: string | null, scope: EditScope): Promise<UndoToken> {
  const d = db();
  const task = await d.tasks.get(taskId);
  if (!task) return [];
  const excs = await taskExceptionsOf(task.id);
  const subs = (await d.task_subtasks.where("task_id").equals(task.id).toArray()).filter((s) => !s.deleted_at);
  const token: UndoToken = [
    ...(await snapshot("tasks", [task.id])),
    ...(await snapshot("task_exceptions", excs.map((x) => x.id))),
    ...(await snapshot("task_subtasks", subs.map((s) => s.id))),
  ];
  const writes: Write[] = [];
  const isFirst = occurrenceKey === task.scheduled_date;
  if (!task.rrule || !occurrenceKey || scope === "all" || (scope === "future" && isFirst)) {
    writes.push({ table: "tasks", row: softDelete(task) });
    excs.forEach((x) => writes.push({ table: "task_exceptions", row: softDelete(x) }));
    subs.forEach((s) => writes.push({ table: "task_subtasks", row: softDelete(s) }));
  } else if (scope === "this") {
    const id = exceptionId(task.id, occurrenceKey);
    const prev = await d.task_exceptions.get(id);
    const row = {
      ...(prev ?? { completed_at: null, title: null, scheduled_date: null, scheduled_time: null, clear_time: false }),
      ...base(prev ?? null),
      id,
      task_id: task.id,
      occurrence_key: occurrenceKey,
      cancelled: true,
    } as TaskException;
    writes.push({ table: "task_exceptions", row });
    if (!prev) token.push({ table: "task_exceptions", row: softDelete(row) });
  } else {
    const rule = endRuleBefore(task.rrule, occurrenceUtils.keyToWall(task.scheduled_date!), occurrenceUtils.keyToWall(occurrenceKey));
    writes.push({ table: "tasks", row: rule ? touch(task, { rrule: rule }) : softDelete(task) });
    excs.filter((x) => x.occurrence_key >= occurrenceKey).forEach((x) => writes.push({ table: "task_exceptions", row: softDelete(x) }));
  }
  await commit(writes);
  return token;
}

// ───────────────────────── Subtasques ─────────────────────────

export async function addSubtask(taskId: string, title: string) {
  const subs = await db().task_subtasks.where("task_id").equals(taskId).toArray();
  const row: Subtask = {
    id: uuid(),
    ...base(),
    task_id: taskId,
    title: title.trim().slice(0, 300),
    done: false,
    sort_order: subs.reduce((m, s) => Math.max(m, s.sort_order), -1) + 1,
  };
  if (!row.title) return;
  await commit([{ table: "task_subtasks", row }]);
}

export async function updateSubtask(id: string, patch: Partial<Pick<Subtask, "title" | "done" | "sort_order">>) {
  const row = await db().task_subtasks.get(id);
  if (!row) return;
  await commit([{ table: "task_subtasks", row: touch(row, patch) }]);
}

export async function deleteSubtask(id: string) {
  const row = await db().task_subtasks.get(id);
  if (!row) return;
  await commit([{ table: "task_subtasks", row: softDelete(row) }]);
}

// ───────────────────────── Moviment des del calendari (arrossegar) ─────────────────────────

/** Mou una ocurrència a un nou inici (amb hora) o a un nou dia (tot el dia) */
export async function moveItem(item: CalendarItem, target: { day: string; minutes: number | null }, scope: EditScope) {
  if (item.kind === "task") {
    const time = target.minutes == null ? null : `${String(Math.floor(target.minutes / 60)).padStart(2, "0")}:${String(target.minutes % 60).padStart(2, "0")}`;
    await scheduleTask(item.sourceId, item.occurrenceKey, target.day, time, scope);
    return;
  }
  const r = await eventDraftFor(item);
  if (!r) return;
  const draft = { ...r.draft };
  if (target.minutes == null) {
    const len = item.allDay ? occurrenceUtils.dayDiff(item.startDay, item.endDay) : 0;
    draft.all_day = true;
    draft.startDay = target.day;
    draft.endDay = occurrenceUtils.addDayKey(target.day, len);
  } else {
    const dur = item.allDay ? 60 * 60000 : Math.max(0, item.end.getTime() - item.start.getTime());
    const s = occurrenceUtils.localMidnight(target.day);
    s.setMinutes(target.minutes);
    draft.all_day = false;
    draft.start = s;
    draft.end = new Date(s.getTime() + (dur || 0));
  }
  await saveEvent(item, draft, scope);
}

export async function resizeEvent(item: CalendarItem, newEnd: Date, scope: EditScope) {
  const r = await eventDraftFor(item);
  if (!r || item.allDay) return;
  await saveEvent(item, { ...r.draft, end: newEnd }, scope);
}

// ───────────────────────── Adopció de dades locals ─────────────────────────

/**
 * Quan un usuari inicia sessió després d'haver fet servir el mode local,
 * les seves dades passen a ser seves i es pugen al servidor.
 */
export async function adoptLocalData(userId: string) {
  const tables: SyncTable[] = ["categories", "events", "event_exceptions", "tasks", "task_subtasks", "task_exceptions"];
  const writes: Write[] = [];
  for (const t of tables) {
    const rows = await table(t).where("user_id").equals("local").toArray();
    rows.forEach((r) => writes.push({ table: t, row: { ...(r as AnyRow), user_id: userId, updated_at: stamp(r.updated_at) } }));
  }
  await commit(writes);
  return writes.length;
}

/** Fusiona categories amb el mateix nom (p. ex. després d'adoptar dades locals) */
export async function dedupeCategories() {
  const d = db();
  const uid = getUserId();
  const cats = (await d.categories.where("user_id").equals(uid).toArray()).filter((c) => !c.deleted_at);
  const byName = new Map<string, Category[]>();
  for (const c of cats) {
    const k = c.name.trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(c);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // Conserva la que ja existia al servidor (o la més antiga)
    group.sort((a, b) => Number(!a.server_updated_at) - Number(!b.server_updated_at) || a.created_at.localeCompare(b.created_at));
    const [keep, ...dupes] = group;
    for (const dup of dupes) await deleteCategory(dup.id, keep.id);
  }
}
