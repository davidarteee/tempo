/** Derivacions per a la secció de Tasques */
import type { Category, Subtask, Task } from "../types";
import { expandTask, occurrenceUtils, type Dataset } from "../recurrence/occurrences";

export interface TaskView {
  task: Task;
  /** Ocurrència rellevant (per a recurrents: la propera pendent) */
  occurrenceKey: string | null;
  date: string | null; // data programada efectiva
  time: string | null;
  completed: boolean;
  completedAt: string | null;
  color: string;
  category: Category | null;
  subDone: number;
  subTotal: number;
  overdue: boolean;
}

export function taskViews(ds: Dataset, subtasks: Map<string, Subtask[]>, today: string): TaskView[] {
  const out: TaskView[] = [];
  const from = occurrenceUtils.localMidnight(occurrenceUtils.addDayKey(today, -1));
  const to = occurrenceUtils.localMidnight(occurrenceUtils.addDayKey(today, 400));
  for (const t of ds.tasks) {
    if (t.deleted_at) continue;
    const cat = t.category_id ? (ds.categories.get(t.category_id) ?? null) : null;
    const category = cat && !cat.deleted_at ? cat : null;
    const subs = (subtasks.get(t.id) ?? []).filter((s) => !s.deleted_at);
    const base = {
      task: t,
      color: category?.color ?? "#8E8E93",
      category,
      subDone: subs.filter((s) => s.done).length,
      subTotal: subs.length,
    };
    if (t.rrule && t.scheduled_date) {
      const occs = expandTask(ds, t, { from, to });
      const next = occs.find((o) => !o.completed && o.startDay >= today);
      if (next) {
        out.push({ ...base, occurrenceKey: next.occurrenceKey, date: next.startDay, time: next.allDay ? null : timeOf(next.start), completed: false, completedAt: null, overdue: false });
      } else {
        out.push({ ...base, occurrenceKey: null, date: null, time: null, completed: true, completedAt: t.updated_at, overdue: false });
      }
      continue;
    }
    out.push({
      ...base,
      occurrenceKey: null,
      date: t.scheduled_date,
      time: t.scheduled_time?.slice(0, 5) ?? null,
      completed: !!t.completed_at,
      completedAt: t.completed_at,
      overdue: !t.completed_at && ((!!t.scheduled_date && t.scheduled_date < today) || (!!t.due_date && t.due_date < today)),
    });
  }
  return out;
}

function timeOf(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function sortByDate(a: TaskView, b: TaskView) {
  if (a.date !== b.date) return (a.date ?? "9") < (b.date ?? "9") ? -1 : 1;
  if (a.time !== b.time) return (a.time ?? "99") < (b.time ?? "99") ? -1 : 1;
  return a.task.sort_order - b.task.sort_order;
}
