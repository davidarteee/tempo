"use client";
/**
 * Accions d'alt nivell que combinen preguntes a l'usuari (abast de recurrència),
 * mutacions i avisos amb "Desfés".
 */
import type { CalendarItem, EditScope } from "../types";
import * as repo from "../db/repo";
import { askScope, toast } from "@/components/ui/feedback";

export async function toggleComplete(item: Pick<CalendarItem, "sourceId" | "occurrenceKey" | "completed" | "title">) {
  const next = !item.completed;
  await repo.toggleTaskComplete(item.sourceId, item.occurrenceKey, next);
  if (next) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
    toast(`"${truncate(item.title)}" completada`, { label: "Desfés", run: () => void repo.toggleTaskComplete(item.sourceId, item.occurrenceKey, false) });
  }
}

export async function deleteItem(item: CalendarItem): Promise<boolean> {
  let scope: EditScope = "all";
  if (item.recurring && item.occurrenceKey) {
    const s = await askScope("delete", item.kind);
    if (!s) return false;
    scope = s;
  }
  const token = item.kind === "event" ? await repo.deleteEvent(item, scope) : await repo.deleteTask(item.sourceId, item.occurrenceKey, scope);
  toast(item.kind === "event" ? "Esdeveniment eliminat" : "Tasca eliminada", { label: "Desfés", run: () => void repo.undo(token) });
  return true;
}

export async function deleteTaskById(taskId: string, title: string) {
  const token = await repo.deleteTask(taskId, null, "all");
  toast(`"${truncate(title)}" eliminada`, { label: "Desfés", run: () => void repo.undo(token) });
}

/** Moure (arrossegar) una ocurrència; pregunta l'abast si és recurrent */
export async function moveWithScope(item: CalendarItem, t: { day: string; minutes: number | null; keepTime?: boolean }) {
  const target = { day: t.day, minutes: t.keepTime && !item.allDay ? item.start.getHours() * 60 + item.start.getMinutes() : t.minutes };
  if (target.day === item.startDay && target.minutes === (item.allDay ? null : item.start.getHours() * 60 + item.start.getMinutes())) return;
  let scope: EditScope = "all";
  if (item.recurring && item.occurrenceKey) {
    const s = await askScope("edit", item.kind);
    if (!s) return;
    scope = s;
  }
  await repo.moveItem(item, target, scope);
}

export async function resizeWithScope(item: CalendarItem, end: Date) {
  let scope: EditScope = "all";
  if (item.recurring && item.occurrenceKey) {
    const s = await askScope("edit", item.kind);
    if (!s) return;
    scope = s;
  }
  if (item.kind === "event") await repo.resizeEvent(item, end, scope);
  else {
    const r = await repo.taskDraftFor(item.sourceId, item.occurrenceKey);
    if (!r) return;
    const minutes = Math.max(5, Math.round((end.getTime() - item.start.getTime()) / 60000 / 5) * 5);
    // la durada és de la sèrie
    await repo.saveTask(item.sourceId, item.occurrenceKey, { ...r.draft, duration_minutes: minutes }, scope === "this" ? "all" : scope);
  }
}

function truncate(s: string, n = 32) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
