/**
 * Ajudes de dates per a la interfície. Treballen amb "claus de dia" ('YYYY-MM-DD')
 * i amb Date locals del navegador.
 */
import { ca } from "date-fns/locale";
import { format as dfFormat } from "date-fns";

export type DayKey = string; // 'YYYY-MM-DD'

export function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(k: DayKey): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DayKey {
  return dayKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysKey(k: DayKey, n: number): DayKey {
  return dayKey(addDays(parseDayKey(k), n));
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last));
  return r;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfWeek(d: Date, weekStart: number): Date {
  const s = startOfDay(d);
  const diff = (s.getDay() - weekStart + 7) % 7;
  return addDays(s, -diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function daysBetweenKeys(a: DayKey, b: DayKey): number {
  const da = parseDayKey(a);
  const db = parseDayKey(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export function atMinutes(day: Date, minutes: number): Date {
  const r = startOfDay(day);
  r.setMinutes(minutes);
  return r;
}

export function fmt(d: Date, pattern: string): string {
  return dfFormat(d, pattern, { locale: ca });
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Noms curts dels dies segons l'inici de setmana */
export function weekdayLabels(weekStart: number, style: "narrow" | "short" = "short"): string[] {
  const base = startOfWeek(new Date(2026, 0, 7), weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(base, i);
    return style === "narrow" ? fmt(d, "EEEEE").toUpperCase() : capitalize(fmt(d, "EEE").replace(".", ""));
  });
}

/** "HH:MM" o "HH:MM:SS" → minuts */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function relativeDayLabel(k: DayKey): string {
  const diff = daysBetweenKeys(todayKey(), k);
  if (diff === 0) return "Avui";
  if (diff === 1) return "Demà";
  if (diff === -1) return "Ahir";
  const d = parseDayKey(k);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return capitalize(fmt(d, sameYear ? "EEE d MMM" : "d MMM yyyy").replace(".", ""));
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
