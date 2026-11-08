"use client";
/**
 * Línia temporal per a les vistes diària i setmanal.
 *  - Carril superior de "tot el dia" (no ocupa espai a la línia horària).
 *  - Columnes horàries amb elements col·locats sense solapaments.
 *  - Clic en un espai buit → nou esdeveniment a aquella hora.
 *  - Arrossegar per moure (també entre dies i cap al carril de tot el dia) i
 *    estirar la vora inferior per canviar la durada.
 */
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalendarItem } from "@/lib/types";
import { layoutAllDay, layoutDay, type PositionedItem } from "./layout";
import { eventStyle, taskStyle } from "./itemStyle";
import { dragHandle } from "@/lib/ui/drag";
import { moveWithScope, resizeWithScope, toggleComplete } from "@/lib/ui/actions";
import { openEditor, setDate, setView, useUI } from "@/lib/ui/state";
import { fmt, fmtTime, parseDayKey, capitalize, minutesToTime } from "@/lib/time/dates";
import { useNow, useTodayKey } from "@/lib/ui/hooks";
import { cn } from "@/lib/cn";
import { TaskCheck } from "../ui/primitives";
import { MapPin, Repeat } from "lucide-react";

const HOUR = 52; // px per hora
const PPM = HOUR / 60;

export function TimeGrid({ days, items, showHeader }: { days: string[]; items: CalendarItem[]; showHeader: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = useTodayKey();
  const now = useNow();
  const showCompleted = useUI((s) => s.prefs.showCompleted);
  const visible = useMemo(() => (showCompleted ? items : items.filter((i) => !i.completed)), [items, showCompleted]);

  const allDay = useMemo(() => layoutAllDay(visible, days), [visible, days]);
  const columns = useMemo(() => days.map((d) => layoutDay(visible, d)), [visible, days]);
  const [expanded, setExpanded] = useState(false);

  // Desplaçament inicial: a l'hora actual o al primer element
  const didScroll = useRef(false);
  useLayoutEffect(() => {
    if (!scroller.current || didScroll.current) return;
    didScroll.current = true;
    const firstTop = Math.min(...columns.flat().map((p) => p.top), 24 * 60);
    const target = days.includes(today) ? now.getHours() * 60 + now.getMinutes() - 90 : firstTop < 24 * 60 ? firstTop - 30 : 8 * 60;
    scroller.current.scrollTop = Math.max(0, target * PPM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxLanes = 3;
  const lanesShown = expanded ? allDay.lanes : Math.min(allDay.lanes, maxLanes);
  const hiddenPerDay = useMemo(() => {
    if (expanded || allDay.lanes <= maxLanes) return null;
    return days.map((_, i) => allDay.laned.filter((l) => l.lane >= maxLanes - 1 && i >= l.startCol && i < l.startCol + l.span).length);
  }, [allDay, days, expanded]);

  const multi = days.length > 1;
  const gridCols = { gridTemplateColumns: `var(--gutter) repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="flex min-h-0 flex-1 flex-col [--gutter:40px] md:[--gutter:52px]">
      {showHeader && (
        <div className="grid shrink-0 border-b border-separator" style={gridCols}>
          <div />
          {days.map((d) => {
            const date = parseDayKey(d);
            const isToday = d === today;
            return (
              <button
                key={d}
                data-drop="date"
                data-day={d}
                onClick={() => {
                  setDate(d);
                  setView("day");
                }}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] text-text-2 transition-colors hover:text-text data-[drop-over]:bg-accent-soft md:flex-row md:gap-1.5 md:py-2 md:text-[13px]"
              >
                <span>{capitalize(fmt(date, "EEE").replace(".", ""))}</span>
                <span className={cn("tabular flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[15px] font-semibold", isToday ? "bg-accent text-white" : "text-text")}>{date.getDate()}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Carril de tot el dia */}
      <div className="grid shrink-0 border-b border-separator" style={gridCols}>
        <div className="flex items-start justify-end pt-1.5 pr-1.5 text-right text-[9.5px] leading-tight font-medium text-text-3 md:pr-2 md:text-[10px]">
          {allDay.lanes > maxLanes ? (
            <button className="hover:text-text" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "menys" : "tot el dia"}
            </button>
          ) : (
            "tot el dia"
          )}
        </div>
        <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, minHeight: Math.max(1, lanesShown) * 24 + 6 }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d, i) => (
              <div
                key={d}
                data-drop="day"
                data-day={d}
                onClick={(e) => {
                  if (e.target === e.currentTarget) openEditor({ type: "event", mode: "create", initial: { all_day: true, startDay: d, endDay: d } });
                }}
                className={cn("h-full data-[drop-over]:bg-accent-soft", i > 0 && "border-l border-separator")}
              />
            ))}
          </div>
          {allDay.laned
            .filter((l) => (expanded || allDay.lanes <= maxLanes ? true : l.lane < maxLanes - 1))
            .map((l) => (
              <AllDayBar key={l.item.key} l={l} total={days.length} />
            ))}
          {hiddenPerDay?.map((n, i) =>
            n > 0 ? (
              <button
                key={i}
                onClick={() => setExpanded(true)}
                className="absolute truncate px-1.5 text-left text-[11px] font-medium text-text-2 hover:text-text"
                style={{ left: `${(i / days.length) * 100}%`, width: `${100 / days.length}%`, top: (maxLanes - 1) * 24 + 4 }}
              >
                +{n} més
              </button>
            ) : null,
          )}
        </div>
      </div>

      {/* Línia temporal */}
      <div ref={scroller} data-drag-scroll className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative grid" style={{ ...gridCols, height: HOUR * 24 }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="tabular absolute right-1.5 -translate-y-1/2 text-[10.5px] text-text-3 md:right-2 md:text-[11px]" style={{ top: (h + 1) * HOUR }}>
                {String(h + 1).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <DayColumn key={d} day={d} positioned={columns[i]} isToday={d === today} now={now} first={i === 0} multi={multi} />
          ))}
        </div>
      </div>
    </div>
  );
}

const DayColumn = memo(function DayColumn({ day, positioned, isToday, now, first, multi }: { day: string; positioned: PositionedItem[]; isToday: boolean; now: Date; first: boolean; multi: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const onBackgroundClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = Math.floor((e.clientY - rect.top) / PPM / 30) * 30;
    const start = parseDayKey(day);
    start.setMinutes(min);
    openEditor({ type: "event", mode: "create", initial: { all_day: false, start, end: null, startDay: day, endDay: day } });
  };

  return (
    <div
      ref={ref}
      data-drop="time"
      data-day={day}
      data-ppm={PPM}
      onClick={onBackgroundClick}
      className={cn("relative data-[drop-over]:bg-accent-soft/40", !first && "border-l border-separator", first && multi && "border-l border-separator")}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--hour-line) ${HOUR - 1}px, var(--hour-line) ${HOUR}px)`,
      }}
    >
      {positioned.map((p) => (
        <TimedBlock key={p.item.key} p={p} day={day} />
      ))}
      {isToday && (
        <div className="pointer-events-none absolute right-0 left-0 z-20 flex items-center" style={{ top: nowMin * PPM }}>
          <span className="-ml-[5px] size-[9px] rounded-full bg-accent" />
          <span className="h-[1.5px] flex-1 bg-accent" />
        </div>
      )}
    </div>
  );
});

function TimedBlock({ p, day }: { p: PositionedItem; day: string }) {
  const { item } = p;
  const [resizeMin, setResizeMin] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const height = (resizeMin ?? p.height) * PPM;
  const compact = height < 34;
  const width = 100 / p.cols;
  const style = item.kind === "event" ? eventStyle(item.color) : taskStyle(item.color);

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const base = p.height;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = base;
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientY - startY) / PPM;
      latest = Math.max(15, Math.round((base + delta) / 15) * 15);
      latest = Math.min(latest, 1440 - p.top);
      setResizeMin(latest);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      if (latest !== base) {
        const dayStart = parseDayKey(day).getTime();
        const end = new Date(dayStart + (p.top + latest) * 60000);
        void resizeWithScope(item, end).finally(() => setResizeMin(null));
      } else setResizeMin(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grab = Math.max(0, (e.clientY - rect.top) / PPM);
    dragHandle(e, () => ({
      label: item.title,
      color: item.color,
      grabOffsetMin: p.continuesBefore ? 0 : Math.round(grab / 15) * 15,
      durationMin: (item.end.getTime() - item.start.getTime()) / 60000,
      onStart: () => setDragging(true),
      onEnd: () => setDragging(false),
      onDrop: (t) => void moveWithScope(item, t),
    }));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${item.kind === "task" ? "Tasca" : "Esdeveniment"}: ${item.title}, ${fmtTime(item.start)}`}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        openItem(item);
      }}
      onKeyDown={(e) => e.key === "Enter" && openItem(item)}
      className={cn(
        "group absolute z-10 cursor-pointer touch-manipulation overflow-hidden rounded-[6px] px-1.5 text-[12px] leading-[1.25] transition-[opacity,box-shadow] select-none [-webkit-touch-callout:none] hover:brightness-[0.98]",
        item.completed && "item-completed",
        dragging && "opacity-40",
        compact ? "flex items-center gap-1 py-0" : "py-1",
      )}
      style={{
        ...style,
        top: p.top * PPM + 1,
        height: Math.max(18, height - 2),
        left: `calc(${p.col * width}% + 1px)`,
        width: `calc(${width}% - 3px)`,
      }}
    >
      <div className={cn("flex min-w-0 gap-1", compact ? "items-center" : "items-start")}>
        {item.kind === "task" && (
          <span className="mt-[1px]">
            <TaskCheck checked={item.completed} color={item.color} size={13} label={`Completar ${item.title}`} onChange={() => void toggleComplete(item)} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={cn("item-title truncate font-semibold", !compact && height > 50 && "line-clamp-2 whitespace-normal")}>{item.title}</div>
          {!compact && (
            <div className="tabular truncate opacity-80">
              {fmtTime(item.start)}
              {item.kind === "event" && item.end > item.start && ` – ${fmtTime(item.end)}`}
              {item.recurring && <Repeat className="ml-1 inline size-[10px] align-[-1px]" />}
            </div>
          )}
          {!compact && height > 64 && item.location && (
            <div className="truncate opacity-75">
              <MapPin className="mr-0.5 inline size-[10px] align-[-1px]" />
              {item.location}
            </div>
          )}
        </div>
        {compact && <span className="tabular shrink-0 opacity-70">{fmtTime(item.start)}</span>}
      </div>
      {resizeMin != null && (
        <div className="tabular absolute right-1 bottom-0.5 rounded bg-black/60 px-1 text-[10px] text-white">{minutesToTime(Math.min(1439, p.top + resizeMin))}</div>
      )}
      {!p.continuesAfter && !item.completed && (
        <div
          aria-hidden
          onPointerDown={onResizeDown}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:h-3"
        >
          <div className="mx-auto mt-[3px] h-[3px] w-6 rounded-full bg-current opacity-40" />
        </div>
      )}
    </div>
  );
}

function AllDayBar({ l, total }: { l: ReturnType<typeof layoutAllDay>["laned"][number]; total: number }) {
  const { item } = l;
  const style = item.kind === "event" ? eventStyle(item.color) : taskStyle(item.color);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) =>
        dragHandle(e, () => ({
          label: item.title,
          color: item.color,
          onDrop: (t) => void moveWithScope(item, t),
        }))
      }
      onClick={() => openItem(item)}
      onKeyDown={(e) => e.key === "Enter" && openItem(item)}
      className={cn(
        "absolute z-10 flex h-[21px] cursor-pointer items-center gap-1 overflow-hidden px-1.5 text-[12px] font-semibold select-none [-webkit-touch-callout:none]",
        l.clippedStart ? "rounded-l-none" : "rounded-l-[5px]",
        l.clippedEnd ? "rounded-r-none" : "rounded-r-[5px]",
        item.completed && "item-completed",
      )}
      style={{ ...style, left: `calc(${(l.startCol / total) * 100}% + 2px)`, width: `calc(${(l.span / total) * 100}% - 4px)`, top: l.lane * 24 + 3 }}
    >
      {item.kind === "task" && <TaskCheck checked={item.completed} color={item.color} size={12} label={`Completar ${item.title}`} onChange={() => void toggleComplete(item)} />}
      <span className="item-title truncate">{item.title}</span>
    </div>
  );
}

export function openItem(item: CalendarItem) {
  if (item.kind === "event") openEditor({ type: "event", mode: "edit", item });
  else openEditor({ type: "task", mode: "edit", taskId: item.sourceId, occurrenceKey: item.occurrenceKey });
}

export { HOUR as HOUR_HEIGHT };
