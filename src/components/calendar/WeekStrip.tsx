"use client";
import { useMemo } from "react";
import { addDaysKey, dayKey, parseDayKey, startOfWeek, weekdayLabels } from "@/lib/time/dates";
import { setDate, useUI } from "@/lib/ui/state";
import { useItems } from "@/lib/data/store";
import { useTodayKey } from "@/lib/ui/hooks";
import { cn } from "@/lib/cn";

/** Franja setmanal per a la vista diària al mòbil (estil iOS) */
export function WeekStrip({ date }: { date: string }) {
  const weekStart = useUI((s) => s.prefs.weekStart);
  const start = dayKey(startOfWeek(parseDayKey(date), weekStart));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(start, i)), [start]);
  const items = useItems(days[0], days[6]);
  const busy = useMemo(() => new Set(items.flatMap((i) => [i.startDay, i.endDay])), [items]);
  const today = useTodayKey();
  const labels = weekdayLabels(weekStart, "narrow");
  return (
    <div className="grid shrink-0 grid-cols-7 border-b border-separator px-1 pb-1.5">
      {days.map((d, i) => {
        const sel = d === date;
        const isToday = d === today;
        return (
          <button key={d} data-drop="date" data-day={d} onClick={() => setDate(d)} className="flex flex-col items-center gap-0.5 rounded-lg py-0.5">
            <span className="text-[10px] font-medium text-text-3">{labels[i]}</span>
            <span
              className={cn(
                "tabular flex size-8 items-center justify-center rounded-full text-[17px]",
                sel && isToday && "bg-accent font-semibold text-white",
                sel && !isToday && "bg-text font-semibold text-inverse",
                !sel && isToday && "font-semibold text-accent",
              )}
            >
              {parseDayKey(d).getDate()}
            </span>
            <span className={cn("size-1 rounded-full", busy.has(d) && !sel ? "bg-text-3" : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}
