/**
 * Càlcul de recordatoris (isomòrfic: el fa servir el client per a avisos locals i
 * el servidor per a Web Push).
 *  - Elements amb hora: l'avís es dispara `offset` minuts abans de l'inici.
 *  - Elements de tot el dia: relatiu a les 09:00 (hora local de l'element) del primer dia.
 */
import { expandEvent, expandTask, type Dataset } from "../recurrence/occurrences";
import { wallFromParts, wallToInstant } from "../time/tz";

export interface DueReminder {
  key: string; // únic: tipus:id:ocurrència:offset
  fireAt: Date;
  title: string;
  body: string;
  url: string;
}

const DAY = 86400000;
const ALL_DAY_HOUR = 9;

function fmtTime(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat("ca", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

function fmtDay(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat("ca", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function dayStartAt9(dayKey: string, tz: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return wallToInstant(wallFromParts(y, m - 1, d, ALL_DAY_HOUR, 0), tz);
}

function describe(offset: number) {
  if (offset === 0) return "Ara";
  if (offset < 60) return `D'aquí a ${offset} min`;
  if (offset % 1440 === 0) return offset === 1440 ? "Demà" : `D'aquí a ${offset / 1440} dies`;
  if (offset % 60 === 0) return `D'aquí a ${offset / 60} h`;
  return `D'aquí a ${Math.floor(offset / 60)} h ${offset % 60} min`;
}

/** Recordatoris amb fireAt dins [from, to) */
export function computeReminders(ds: Dataset, from: Date, to: Date): DueReminder[] {
  const out: DueReminder[] = [];
  // Els avisos poden ser fins a 4 setmanes abans de l'inici
  const range = { from: new Date(from.getTime() - DAY), to: new Date(to.getTime() + 29 * DAY) };

  for (const ev of ds.events) {
    if (ev.deleted_at || !ev.reminders?.length) continue;
    const tz = ev.timezone || "UTC";
    for (const occ of expandEvent(ds, ev, range)) {
      const start = occ.allDay ? dayStartAt9(occ.startDay, tz) : occ.start;
      for (const offset of ev.reminders) {
        const fireAt = new Date(start.getTime() - offset * 60000);
        if (fireAt < from || fireAt >= to) continue;
        const when = occ.allDay ? fmtDay(start, tz) : `${fmtDay(occ.start, tz)}, ${fmtTime(occ.start, tz)}`;
        out.push({
          key: `e:${ev.id}:${occ.occurrenceKey ?? ""}:${offset}`,
          fireAt,
          title: occ.title,
          body: [occ.allDay ? `Tot el dia · ${when}` : `${describe(offset)} · ${when}`, occ.location].filter(Boolean).join(" · "),
          url: "/calendar",
        });
      }
    }
  }

  for (const t of ds.tasks) {
    if (t.deleted_at || !t.reminders?.length || !t.scheduled_date) continue;
    const tz = t.timezone || "UTC";
    for (const occ of expandTask(ds, t, range)) {
      if (occ.completed) continue;
      const start = occ.allDay ? dayStartAt9(occ.startDay, tz) : occ.start;
      for (const offset of t.reminders) {
        const fireAt = new Date(start.getTime() - offset * 60000);
        if (fireAt < from || fireAt >= to) continue;
        out.push({
          key: `t:${t.id}:${occ.occurrenceKey ?? ""}:${offset}`,
          fireAt,
          title: `☐ ${occ.title}`,
          body: occ.allDay ? `Tasca per ${fmtDay(start, tz)}` : `${describe(offset)} · ${fmtTime(occ.start, tz)}`,
          url: "/today",
        });
      }
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
