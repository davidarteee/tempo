/**
 * Base de dades local (IndexedDB via Dexie). És la font de veritat de la interfície:
 * totes les lectures surten d'aquí i totes les escriptures hi van primer
 * (local-first). El motor de sincronització replica els canvis amb Supabase.
 */
import Dexie, { type Table } from "dexie";
import type { Category, EventException, EventRow, Profile, Subtask, SyncTable, Task, TaskException } from "../types";

export interface OutboxEntry {
  seq?: number;
  table: SyncTable;
  row_id: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  /** Entrades que han fallat massa vegades amb errors no recuperables */
  dead: 0 | 1;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class TempoDB extends Dexie {
  categories!: Table<Category, string>;
  events!: Table<EventRow, string>;
  event_exceptions!: Table<EventException, string>;
  tasks!: Table<Task, string>;
  task_subtasks!: Table<Subtask, string>;
  task_exceptions!: Table<TaskException, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;
  profile!: Table<Profile, string>;

  constructor() {
    super("tempo");
    this.version(1).stores({
      categories: "id, user_id",
      events: "id, user_id, start_at, start_date",
      event_exceptions: "id, user_id, event_id",
      tasks: "id, user_id, scheduled_date",
      task_subtasks: "id, user_id, task_id",
      task_exceptions: "id, user_id, task_id",
      outbox: "++seq, [table+row_id], dead",
      meta: "key",
      profile: "id",
    });
  }
}

let _db: TempoDB | null = null;

export function db(): TempoDB {
  if (!_db) _db = new TempoDB();
  return _db;
}

export function table(name: SyncTable) {
  return db()[name] as unknown as Table<{ id: string; updated_at: string; deleted_at: string | null; user_id: string }, string>;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const r = await db().meta.get(key);
  return (r?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown) {
  await db().meta.put({ key, value });
}

/** Esborra totes les dades locals (tancament de sessió) */
export async function wipeLocal() {
  const d = db();
  await d.transaction("rw", [d.categories, d.events, d.event_exceptions, d.tasks, d.task_subtasks, d.task_exceptions, d.outbox, d.meta, d.profile], async () => {
    await Promise.all([
      d.categories.clear(),
      d.events.clear(),
      d.event_exceptions.clear(),
      d.tasks.clear(),
      d.task_subtasks.clear(),
      d.task_exceptions.clear(),
      d.outbox.clear(),
      d.meta.clear(),
      d.profile.clear(),
    ]);
  });
}
