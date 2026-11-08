"use client";
import { memo, useMemo } from "react";
import { useItems } from "@/lib/data/store";
import { itemsByDay } from "@/lib/recurrence/occurrences";
import { capitalize, fmt, parseDayKey, weekdayLabels } from "@/lib/time/dates";
import { setDate, setView, useUI } from "@/lib/ui/state";
import { useTodayKey } from "@/lib/ui/hooks";
import { monthGrid } from "./MonthView";
import { cn } from "@/lib/cn";

/** Vista anual: 12 mesos; els dies amb elements (també de tot el dia) es marquen */
export function YearView({ date }: { date: string }) {
  const year = parseDayKey(date).getFullYear();
  const weekStart = useUI((s) => s.prefs.weekStart);
  const items = useItems(`${year}-01-01`, `${year}-12-31`);
  const byDay = useMemo(() => itemsByDay(items, `${year}-01-01`, `${year}-12-31`), [items, year]);
  const today = useTodayKey();
  const labels = weekdayLabels(weekStart, "narrow");

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MiniMonthYear key={m} year={year} month={m} byDay={byDay} today={today} weekStart={weekStart} labels={labels} />
        ))}
      </div>
    </div>
  );
}

const MiniMonthYear = memo(function MiniMonthYear({ year, month, byDay, today, weekStart, labels }: { year: number; month: number; byDay: Map<string, unknown[]>; today: string; weekStart: number; labels: string[] }) {
  const key = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const days = monthGrid(key, weekStart);
  const isCurrent = today.slice(0, 7) === key.slice(0, 7);
  return (
    <section>
      <button
        onClick={() => {
          setDate(key);
          setView("month");
        }}
        className={cn("mb-1.5 rounded-md px-1 text-[17px] font-semibold hover:bg-fill", isCurrent ? "text-accent" : "text-text")}
      >
        {capitalize(fmt(parseDayKey(key), "LLLL"))}
      </button>
      <div className="grid grid-cols-7 text-center text-[10px] text-text-3">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">
        {days.map((d) => {
          const inMonth = parseDayKey(d).getMonth() === month;
          if (!inMonth) return <span key={d} />;
          const count = (byDay.get(d)?.length ?? 0) as number;
          const isToday = d === today;
          return (
            <button
              key={d}
              onClick={() => {
                setDate(d);
                setView("day");
              }}
              title={count ? `${count} element${count === 1 ? "" : "s"}` : undefined}
              className="relative flex aspect-square items-center justify-center rounded-full text-[11px] hover:bg-fill"
            >
              <span className={cn("tabular flex size-[22px] items-center justify-center rounded-full", isToday && "bg-accent font-semibold text-white")}>{parseDayKey(d).getDate()}</span>
              {count > 0 && !isToday && <span className="absolute bottom-[1px] size-[3px] rounded-full bg-text-3" />}
            </button>
          );
        })}
      </div>
    </section>
  );
});
