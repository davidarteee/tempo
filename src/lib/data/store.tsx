"use client";
/**
 * Lectura reactiva de la base local. Un únic proveïdor subscriu les taules
 * (Dexie liveQuery) i exposa un Dataset memoritzat; cada vista només calcula
 * les ocurrències del seu interval visible.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/local";
import type { Category, EventException, EventRow, Subtask, Task, TaskException, CalendarItem } from "../types";
import { buildItems, dayRange, groupExceptions, type Dataset } from "../recurrence/occurrences";
import { getUserId } from "../session";

interface Store {
  ready: boolean;
  dataset: Dataset;
  categories: Category[]; // actives, ordenades
  tasks: Task[]; // no esborrades
  subtasksByTask: Map<string, Subtask[]>;
  taskExceptions: TaskException[];
}

const Ctx = createContext<Store | null>(null);

const empty: never[] = [];

export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const mine = <T extends { user_id: string; deleted_at: string | null }>(rows: T[]) => rows.filter((r) => r.user_id === userId && !r.deleted_at);
  const categories = useLiveQuery(() => db().categories.toArray().then(mine), [userId]);
  const events = useLiveQuery(() => db().events.toArray().then(mine), [userId]);
  const eventExceptions = useLiveQuery(() => db().event_exceptions.toArray().then(mine), [userId]);
  const tasks = useLiveQuery(() => db().tasks.toArray().then(mine), [userId]);
  const subtasks = useLiveQuery(() => db().task_subtasks.toArray().then(mine), [userId]);
  const taskExceptions = useLiveQuery(() => db().task_exceptions.toArray().then(mine), [userId]);

  const ready = [categories, events, eventExceptions, tasks, subtasks, taskExceptions].every((x) => x !== undefined);

  const store = useMemo<Store>(() => {
    const cats = ((categories ?? empty) as Category[]).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const subsMap = new Map<string, Subtask[]>();
    for (const s of (subtasks ?? empty) as Subtask[]) {
      let arr = subsMap.get(s.task_id);
      if (!arr) subsMap.set(s.task_id, (arr = []));
      arr.push(s);
    }
    subsMap.forEach((arr) => arr.sort((a, b) => a.sort_order - b.sort_order));
    const dataset: Dataset = {
      events: (events ?? empty) as EventRow[],
      eventExceptions: groupExceptions((eventExceptions ?? empty) as EventException[], (x) => x.event_id),
      tasks: (tasks ?? empty) as Task[],
      taskExceptions: groupExceptions((taskExceptions ?? empty) as TaskException[], (x) => x.task_id),
      categories: new Map(((categories ?? empty) as Category[]).map((c) => [c.id, c])),
    };
    return {
      ready,
      dataset,
      categories: cats,
      tasks: dataset.tasks,
      subtasksByTask: subsMap,
      taskExceptions: (taskExceptions ?? empty) as TaskException[],
    };
  }, [ready, categories, events, eventExceptions, tasks, subtasks, taskExceptions]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside DataProvider");
  return s;
}

/** Ocurrències (esdeveniments + tasques) d'un interval de dies */
export function useItems(fromDay: string, toDay: string): CalendarItem[] {
  const { dataset } = useStore();
  return useMemo(() => buildItems(dataset, dayRange(fromDay, toDay)), [dataset, fromDay, toDay]);
}

export function useCategory(id: string | null) {
  const { dataset } = useStore();
  return id ? (dataset.categories.get(id) ?? null) : null;
}

export { getUserId };
