"use client";
import { memo, useMemo } from "react";
import type { CalendarItem } from "@/lib/types";
import { addDays, dayKey, fmtTime, parseDayKey, startOfMonth, startOfWeek, weekdayLabels } from "@/lib/time/dates";
import { itemsByDay } from "@/lib/recurrence/occurrences";
import { useItems } from "@/lib/data/store";
import { openEditor, setDate, setView, useUI } from "@/lib/ui/state";
import { useIsDesktop, useTodayKey } from "@/lib/ui/hooks";
import { dragHandle } from "@/lib/ui/drag";
import { moveWithScope } from "@/lib/ui/actions";
import { cn } from "@/lib/cn";
import { eventStyle } from "./itemStyle";
import { openItem } from "./TimeGrid";
import { DayList } from "./DayList";

export function monthGrid(date: string, weekStart: number): string[] {
  const d = parseDayKey(date);
  const first = startOfMonth(d);
  const start = startOfWeek(first, weekStart);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const days: string[] = [];
  let cur = start;
  while (cur <= last || days.length % 7 !== 0) {
    days.push(dayKey(cur));
    cur = addDays(cur, 1);
  }
  return days;
}

export function MonthView({ date }: { date: string }) {
  const weekStart = useUI((s) => s.prefs.weekStart);
  const showCompleted = useUI((s) => s.prefs.showCompleted);
  const desktop = useIsDesktop();
  const days = useMemo(() => monthGrid(date, weekStart), [date, weekStart]);
  const all = useItems(days[0], days[days.length - 1]);
  const items = useMemo(() => (showCompleted ? all : all.filter((i) => !i.completed)), [all, showCompleted]);
  const byDay = useMemo(() => itemsByDay(items, days[0], days[days.length - 1]), [items, days]);
  const month = parseDayKey(date).getMonth();
  const today = useTodayKey();
  const weeks = days.length / 7;
  const labels = weekdayLabels(weekStart, desktop ? "short" : "narrow");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-separator">
        {labels.map((l, i) => (
          <div key={i} className={cn("py-1.5 text-[12px] font-medium text-text-3", desktop ? "pr-2 text-right" : "text-center")}>
            {l}
          </div>
        ))}
      </div>
      <div className={cn("grid grid-cols-7", desktop ? "min-h-0 flex-1" : "shrink-0")} style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <MonthCell
            key={d}
            day={d}
            items={byDay.get(d) ?? []}
            inMonth={parseDayKey(d).getMonth() === month}
            isToday={d === today}
            selected={!desktop && d === date}
            desktop={desktop}
            firstCol={i % 7 === 0}
          />
        ))}
      </div>
      {!desktop && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-separator">
          <DayList day={date} />
        </div>
      )}
    </div>
  );
}

const MAX_DESKTOP = 4;

const MonthCell = memo(function MonthCell({ day, items, inMonth, isToday, selected, desktop, firstCol }: { day: string; items: CalendarItem[]; inMonth: boolean; isToday: boolean; selected: boolean; desktop: boolean; firstCol: boolean }) {
  const n = parseDayKey(day).getDate();
  if (!desktop) {
    const dots = items.slice(0, 4);
    return (
      <button
        data-drop="date"
        data-day={day}
        onClick={() => setDate(day)}
        onDoubleClick={() => {
          setDate(day);
          setView("day");
        }}
        aria-label={`${day}, ${items.length} elements`}
        aria-pressed={selected}
        className={cn("flex h-[52px] flex-col items-center gap-1 border-b border-separator pt-1.5", !inMonth && "opacity-35")}
      >
        <span
          className={cn(
            "tabular flex size-7 items-center justify-center rounded-full text-[16px]",
            selected && isToday && "bg-accent font-semibold text-white",
            selected && !isToday && "bg-text font-semibold text-inverse",
            !selected && isToday && "font-semibold text-accent",
          )}
        >
          {n}
        </span>
        <span className="flex h-1.5 gap-[3px]">
          {dots.map((it) => (
            <span key={it.key} className={cn("size-[5px] rounded-full", it.completed && "opacity-40")} style={{ background: it.color }} />
          ))}
        </span>
      </button>
    );
  }

  const shown = items.slice(0, items.length > MAX_DESKTOP ? MAX_DESKTOP - 1 : MAX_DESKTOP);
  const more = items.length - shown.length;
  return (
    <div
      data-drop="date"
      data-day={day}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const start = parseDayKey(day);
        start.setHours(9);
        openEditor({ type: "event", mode: "create", initial: { all_day: false, start, startDay: day, endDay: day } });
      }}
      className={cn("flex min-h-0 flex-col gap-[2px] overflow-hidden border-b border-separator p-1", !firstCol && "border-l", !inMonth && "bg-surface-2/60")}
    >
      <button
        onClick={() => {
          setDate(day);
          setView("day");
        }}
        className={cn(
          "tabular mb-0.5 ml-auto flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[13px] font-medium hover:bg-fill",
          isToday ? "bg-accent text-white hover:bg-accent" : inMonth ? "text-text" : "text-text-3",
        )}
      >
        {n === 1 ? parseDayKey(day).toLocaleDateString("ca", { day: "numeric", month: "short" }).replace(".", "") : n}
      </button>
      {shown.map((it) => (
        <MonthChip key={it.key} item={it} />
      ))}
      {more > 0 && (
        <button
          onClick={() => {
            setDate(day);
            setView("day");
          }}
          className="px-1 text-left text-[11px] font-medium text-text-2 hover:text-text"
        >
          {more} més
        </button>
      )}
    </div>
  );
});

function MonthChip({ item }: { item: CalendarItem }) {
  const onPointerDown = (e: React.PointerEvent) =>
    dragHandle(e, () => ({ label: item.title, color: item.color, onDrop: (t) => void moveWithScope(item, t) }));
  // Tots els elements es mostren com una tira del color de la categoria.
  // Les tasques conserven el cercle (casella) per distingir-les dels esdeveniments.
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={() => openItem(item)}
      onKeyDown={(e) => e.key === "Enter" && openItem(item)}
      className={cn("flex h-[19px] shrink-0 cursor-pointer items-center gap-1 rounded-[4px] pr-1 pl-1.5 text-[11.5px] font-semibold select-none hover:brightness-[0.97]", item.completed && "item-completed")}
      style={eventStyle(item.color)}
    >
      {item.kind === "task" && <span className="size-[7px] shrink-0 rounded-full border-[1.5px] border-current" />}
      <span className="item-title min-w-0 flex-1 truncate">{item.title}</span>
      {!item.allDay && <span className="tabular shrink-0 font-normal opacity-70">{fmtTime(item.start)}</span>}
    </div>
  );
}
