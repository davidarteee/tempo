import type { CalendarItem } from "@/lib/types";
import { occurrenceUtils } from "@/lib/recurrence/occurrences";

export interface PositionedItem {
  item: CalendarItem;
  top: number; // minuts des de mitjanit
  height: number; // minuts
  col: number;
  cols: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

const MIN_VISUAL = 22;

/** Col·loca elements amb hora d'un dia en columnes sense solapaments visuals */
export function layoutDay(items: CalendarItem[], day: string): PositionedItem[] {
  const dayStart = occurrenceUtils.localMidnight(day).getTime();
  const dayEnd = occurrenceUtils.localMidnight(occurrenceUtils.addDayKey(day, 1)).getTime();
  const segs = items
    .filter((it) => !it.allDay && it.start.getTime() < dayEnd && (it.end.getTime() > dayStart || it.start.getTime() >= dayStart))
    .map((it) => {
      const s = Math.max(it.start.getTime(), dayStart);
      const e = Math.min(Math.max(it.end.getTime(), it.start.getTime()), dayEnd);
      const top = (s - dayStart) / 60000;
      const height = Math.max(MIN_VISUAL, (e - s) / 60000);
      return { item: it, top, height: Math.min(height, 1440 - top), continuesBefore: it.start.getTime() < dayStart, continuesAfter: it.end.getTime() > dayEnd };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  const out: PositionedItem[] = [];
  let cluster: (typeof segs[number] & { col: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = cluster.reduce((m, s) => Math.max(m, s.col + 1), 0);
    cluster.forEach((s) => out.push({ ...s, cols }));
    cluster = [];
  };
  const colEnds: number[] = [];
  for (const s of segs) {
    if (s.top >= clusterEnd && cluster.length) {
      flush();
      colEnds.length = 0;
    }
    let col = colEnds.findIndex((end) => end <= s.top);
    if (col === -1) col = colEnds.length;
    colEnds[col] = s.top + s.height;
    cluster.push({ ...s, col });
    clusterEnd = Math.max(clusterEnd, s.top + s.height);
  }
  if (cluster.length) flush();
  return out;
}

export interface LanedItem {
  item: CalendarItem;
  startCol: number;
  span: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** Distribueix elements de tot el dia (inclosos els de diversos dies) en carrils */
export function layoutAllDay(items: CalendarItem[], days: string[]): { laned: LanedItem[]; lanes: number } {
  const first = days[0];
  const last = days[days.length - 1];
  const res: LanedItem[] = [];
  const laneEnds: number[] = [];
  const sorted = items
    .filter((i) => i.allDay && i.startDay <= last && i.endDay >= first)
    .sort((a, b) => (a.startDay < b.startDay ? -1 : a.startDay > b.startDay ? 1 : occurrenceUtils.dayDiff(b.startDay, b.endDay) - occurrenceUtils.dayDiff(a.startDay, a.endDay)));
  for (const it of sorted) {
    const s = it.startDay < first ? first : it.startDay;
    const e = it.endDay > last ? last : it.endDay;
    const startCol = occurrenceUtils.dayDiff(first, s);
    const span = occurrenceUtils.dayDiff(s, e) + 1;
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = startCol + span - 1;
    res.push({ item: it, startCol, span, lane, clippedStart: it.startDay < first, clippedEnd: it.endDay > last });
  }
  return { laned: res, lanes: laneEnds.length };
}
