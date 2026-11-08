/**
 * Tipus de dades. Coincideixen 1:1 amb les columnes de Postgres (snake_case)
 * perquè la capa local (IndexedDB) i la remota comparteixin el mateix format.
 */

export interface SyncMeta {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  server_updated_at?: string | null;
  deleted_at: string | null;
}

export interface Category extends SyncMeta {
  name: string;
  color: string;
  sort_order: number;
}

export interface EventRow extends SyncMeta {
  calendar_id: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  start_at: string | null; // ISO (instant)
  end_at: string | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD inclusiu
  timezone: string;
  rrule: string | null;
  series_parent_id: string | null;
  reminders: number[];
}

export interface EventException extends SyncMeta {
  event_id: string;
  occurrence_key: string;
  cancelled: boolean;
  title: string | null;
  description: string | null;
  location: string | null;
  category_id: string | null;
  all_day: boolean | null;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface Task extends SyncMeta {
  category_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null; // HH:MM:SS
  duration_minutes: number;
  timezone: string;
  rrule: string | null;
  completed_at: string | null;
  reminders: number[];
  sort_order: number;
}

export interface Subtask extends SyncMeta {
  task_id: string;
  title: string;
  done: boolean;
  sort_order: number;
}

export interface TaskException extends SyncMeta {
  task_id: string;
  occurrence_key: string;
  cancelled: boolean;
  completed_at: string | null;
  title: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  clear_time: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  week_start: number;
  theme: "system" | "light" | "dark";
  default_calendar_id: string | null;
  updated_at: string;
}

export type SyncTable =
  | "categories"
  | "events"
  | "event_exceptions"
  | "tasks"
  | "task_subtasks"
  | "task_exceptions";

/** Ordre de pujada (respecta les claus foranes) */
export const SYNC_TABLES: SyncTable[] = [
  "categories",
  "events",
  "event_exceptions",
  "tasks",
  "task_subtasks",
  "task_exceptions",
];

export type EditScope = "this" | "future" | "all";

/** Ocurrència concreta que es mostra al calendari (esdeveniment o tasca). */
export interface CalendarItem {
  key: string; // únic per ocurrència
  kind: "event" | "task";
  sourceId: string;
  occurrenceKey: string | null; // null si no és recurrent
  recurring: boolean;
  title: string;
  location: string | null;
  categoryId: string | null;
  color: string;
  allDay: boolean;
  /** Elements amb hora: instants reals */
  start: Date;
  end: Date;
  /** Elements de tot el dia: dies (inclusiu) */
  startDay: string;
  endDay: string;
  completed: boolean;
  isFirstOccurrence: boolean;
}
