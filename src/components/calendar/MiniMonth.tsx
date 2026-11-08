"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, capitalize, dayKey, fmt, parseDayKey, weekdayLabels } from "@/lib/time/dates";
import { monthGrid } from "./MonthView";
import { useUI } from "@/lib/ui/state";
import { useTodayKey } from "@/lib/ui/hooks";
import { cn } from "@/lib/cn";
import { IconButton } from "../ui/primitives";

/** Mini calendari per a la barra lateral i els selectors de data */
export function MiniMonth({ value, onSelect, marked, highlightWeek }: { value: string; onSelect: (d: string) => void; marked?: Set<string>; highlightWeek?: boolean }) {
  const weekStart = useUI((s) => s.prefs.weekStart);
  const [cursor, setCursor] = useState(value.slice(0, 7));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value.slice(0, 7) !== cursor) setCursor(value.slice(0, 7));
  }
  const key = `${cursor}-01`;
  const days = useMemo(() => monthGrid(key, weekStart), [key, weekStart]);
  const today = useTodayKey();
  const month = parseDayKey(key).getMonth();
  const labels = weekdayLabels(weekStart, "narrow");
  const selWeek = highlightWeek ? Math.floor(days.indexOf(value) / 7) : -1;

  const shift = (n: number) => setCursor(dayKey(addMonths(parseDayKey(key), n)).slice(0, 7));

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between pl-1">
        <span className="text-[13px] font-semibold">{capitalize(fmt(parseDayKey(key), "LLLL yyyy"))}</span>
        <div className="flex">
          <IconButton size="sm" label="Mes anterior" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton size="sm" label="Mes següent" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-text-3">
        {labels.map((l, i) => (
          <span key={i} className="py-0.5">
            {l}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">
        {days.map((d, i) => {
          const inMonth = parseDayKey(d).getMonth() === month;
          const sel = d === value;
          const isToday = d === today;
          const inWeek = Math.floor(i / 7) === selWeek;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              className={cn("relative flex h-7 items-center justify-center text-[12px]", inWeek && "bg-fill first:rounded-l-full", inWeek && i % 7 === 0 && "rounded-l-full", inWeek && i % 7 === 6 && "rounded-r-full")}
            >
              <span
                className={cn(
                  "tabular flex size-6 items-center justify-center rounded-full transition-colors hover:bg-fill-strong",
                  !inMonth && "text-text-3",
                  isToday && !sel && "font-semibold text-accent",
                  sel && (isToday ? "bg-accent font-semibold text-white hover:bg-accent" : "bg-text font-semibold text-inverse hover:bg-text"),
                )}
              >
                {parseDayKey(d).getDate()}
              </span>
              {marked?.has(d) && !sel && <span className="absolute bottom-0 size-[3px] rounded-full bg-text-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
