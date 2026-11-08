"use client";
/**
 * Estat de la interfície (fora de React per poder-lo cridar des de dreceres,
 * arrossegament, etc.) amb subscripció via useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import type { CalendarItem } from "../types";
import type { EventDraft, TaskDraft } from "../db/repo";
import { todayKey } from "../time/dates";

export type ThemePref = "system" | "light" | "dark";
export type CalendarView = "day" | "week" | "month" | "year" | "agenda";

export interface Prefs {
  theme: ThemePref;
  weekStart: number; // 0 = diumenge, 1 = dilluns
  showCompleted: boolean;
  defaultDuration: number; // minuts
  defaultReminders: number[];
}

export type EditorState =
  | { type: "event"; mode: "create"; initial?: Partial<EventDraft> }
  | { type: "event"; mode: "edit"; item: CalendarItem }
  | { type: "task"; mode: "create"; initial?: Partial<TaskDraft> }
  | { type: "task"; mode: "edit"; taskId: string; occurrenceKey: string | null }
  | null;

interface UIState {
  prefs: Prefs;
  editor: EditorState;
  view: CalendarView;
  date: string;
  quickCreate: boolean;
}

const DEFAULT_PREFS: Prefs = { theme: "system", weekStart: 1, showCompleted: true, defaultDuration: 60, defaultReminders: [] };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem("tempo:prefs");
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

function loadView(): CalendarView {
  try {
    const v = localStorage.getItem("tempo:view") as CalendarView | null;
    if (v && ["day", "week", "month", "year", "agenda"].includes(v)) return v;
  } catch {}
  return window.matchMedia("(min-width: 768px)").matches ? "week" : "day";
}

let state: UIState = { prefs: DEFAULT_PREFS, editor: null, view: "week", date: "2000-01-01", quickCreate: false };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function hydrateUI() {
  if (hydrated) return;
  hydrated = true;
  state = { ...state, prefs: loadPrefs(), view: loadView(), date: todayKey() };
  emit();
}

export function getUI() {
  return state;
}

function set(patch: Partial<UIState>) {
  state = { ...state, ...patch };
  emit();
}

export function useUI<T>(sel: (s: UIState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sel(state),
    () => sel(state),
  );
}

export function setPrefs(patch: Partial<Prefs>) {
  const prefs = { ...state.prefs, ...patch };
  try {
    localStorage.setItem("tempo:prefs", JSON.stringify(prefs));
  } catch {}
  set({ prefs });
  if (patch.theme) applyTheme(prefs.theme);
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#ffffff");
}

export function setView(view: CalendarView) {
  try {
    localStorage.setItem("tempo:view", view);
  } catch {}
  set({ view });
}

export function setDate(date: string) {
  set({ date });
}

export function openEditor(editor: EditorState) {
  set({ editor, quickCreate: false });
}

export function closeEditor() {
  set({ editor: null });
}

export function setQuickCreate(open: boolean) {
  set({ quickCreate: open });
}
