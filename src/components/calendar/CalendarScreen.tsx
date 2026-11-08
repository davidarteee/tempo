"use client";
/**
 * Pantalla principal del calendari: capçalera amb navegació, selector de vista i la vista activa.
 * Dreceres: ←/→ navegar, "." o "h" avui, d/s/m/a/l vistes.
 */
import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { setDate, setView, useUI, openEditor, setQuickCreate, type CalendarView } from "@/lib/ui/state";
import { addDays, addDaysKey, addMonths, capitalize, dayKey, fmt, parseDayKey, startOfWeek, todayKey } from "@/lib/time/dates";
import { useItems } from "@/lib/data/store";
import { useIsDesktop, useTodayKey } from "@/lib/ui/hooks";
import { Button, IconButton, Segmented } from "../ui/primitives";
import { TimeGrid } from "./TimeGrid";
import { MonthView } from "./MonthView";
import { YearView } from "./YearView";
import { AgendaView } from "./AgendaView";
import { WeekStrip } from "./WeekStrip";
import { cn } from "@/lib/cn";

const VIEWS: { value: CalendarView; label: string; short: string; key: string }[] = [
  { value: "day", label: "Dia", short: "D", key: "d" },
  { value: "week", label: "Setmana", short: "S", key: "s" },
  { value: "month", label: "Mes", short: "M", key: "m" },
  { value: "year", label: "Any", short: "A", key: "a" },
  { value: "agenda", label: "Llista", short: "L", key: "l" },
];

export function navigate(view: CalendarView, date: string, dir: -1 | 1): string {
  const d = parseDayKey(date);
  switch (view) {
    case "day":
      return addDaysKey(date, dir);
    case "week":
      return addDaysKey(date, 7 * dir);
    case "month":
      return dayKey(addMonths(new Date(d.getFullYear(), d.getMonth(), 1), dir));
    case "year":
      return `${d.getFullYear() + dir}-01-01`;
    case "agenda":
      return addDaysKey(date, 30 * dir);
  }
}

function title(view: CalendarView, date: string, weekStart: number, desktop: boolean) {
  const d = parseDayKey(date);
  if (view === "year") return String(d.getFullYear());
  if (view === "month") return capitalize(fmt(d, "LLLL yyyy"));
  if (view === "day") return desktop ? capitalize(fmt(d, "EEEE, d MMMM yyyy")) : capitalize(fmt(d, "LLLL yyyy"));
  if (view === "agenda") return capitalize(fmt(d, "LLLL yyyy"));
  const s = startOfWeek(d, weekStart);
  const e = addDays(s, 6);
  if (s.getMonth() === e.getMonth()) return capitalize(fmt(s, "LLLL yyyy"));
  if (s.getFullYear() === e.getFullYear()) return `${capitalize(fmt(s, "LLL"))} – ${fmt(e, "LLL yyyy")}`.replace(/\./g, "");
  return `${capitalize(fmt(s, "LLL yyyy"))} – ${fmt(e, "LLL yyyy")}`.replace(/\./g, "");
}

export function CalendarScreen() {
  const view = useUI((s) => s.view);
  const date = useUI((s) => s.date);
  const weekStart = useUI((s) => s.prefs.weekStart);
  const desktop = useIsDesktop();
  const today = useTodayKey();

  // Dreceres de teclat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const v = VIEWS.find((x) => x.key === e.key.toLowerCase());
      if (v) {
        setView(v.value);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") setDate(navigate(view, date, -1));
      else if (e.key === "ArrowRight") setDate(navigate(view, date, 1));
      else if (e.key === "." || e.key.toLowerCase() === "h") setDate(todayKey());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, date]);

  // Lliscar horitzontalment per navegar (mòbil)
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || document.documentElement.classList.contains("dragging-active")) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 600) setDate(navigate(view, date, dx < 0 ? 1 : -1));
  };

  const isCurrent = useMemo(() => {
    if (view === "day") return date === today;
    if (view === "week") return dayKey(startOfWeek(parseDayKey(date), weekStart)) === dayKey(startOfWeek(parseDayKey(today), weekStart));
    if (view === "month" || view === "agenda") return date.slice(0, 7) === today.slice(0, 7);
    return date.slice(0, 4) === today.slice(0, 4);
  }, [view, date, today, weekStart]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="pt-safe shrink-0 border-b border-separator bg-bg/85 backdrop-blur-xl md:border-b-0">
        <div className="flex h-12 items-center gap-2 px-3 md:h-14 md:px-5">
          <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold tracking-tight md:text-[22px]">{title(view, date, weekStart, desktop)}</h1>
          <div className="flex items-center gap-0.5">
            <IconButton label="Anterior (←)" onClick={() => setDate(navigate(view, date, -1))}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <Button size="sm" variant={isCurrent ? "secondary" : "tinted"} onClick={() => setDate(todayKey())} title="Avui (.)">
              Avui
            </Button>
            <IconButton label="Següent (→)" onClick={() => setDate(navigate(view, date, 1))}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
          {desktop && (
            <>
              <Segmented value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: v.label, title: `${v.label} (${v.key.toUpperCase()})` }))} />
              <Button variant="primary" size="sm" onClick={() => openEditor({ type: "event", mode: "create", initial: { startDay: date, endDay: date } })} title="Nou esdeveniment (N)">
                <Plus className="size-4" /> Nou
              </Button>
            </>
          )}
        </div>
        {!desktop && (
          <div className="px-3 pb-2">
            <Segmented className="w-full" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: v.label }))} />
          </div>
        )}
      </header>
      <div key={view} className="anim-view flex min-h-0 flex-1 flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {view === "day" && <DayView date={date} desktop={desktop} />}
        {view === "week" && <WeekView date={date} weekStart={weekStart} />}
        {view === "month" && <MonthView date={date} />}
        {view === "year" && <YearView date={date} />}
        {view === "agenda" && <AgendaView date={date} />}
      </div>
      {!desktop && (
        <button
          aria-label="Crear"
          onClick={() => setQuickCreate(true)}
          className={cn("fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-pop transition-transform active:scale-95")}
        >
          <Plus className="size-7" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function DayView({ date, desktop }: { date: string; desktop: boolean }) {
  const items = useItems(date, date);
  const days = useMemo(() => [date], [date]);
  return (
    <>
      {!desktop && <WeekStrip date={date} />}
      <TimeGrid key={date} days={days} items={items} showHeader={false} />
    </>
  );
}

function WeekView({ date, weekStart }: { date: string; weekStart: number }) {
  const start = dayKey(startOfWeek(parseDayKey(date), weekStart));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(start, i)), [start]);
  const items = useItems(days[0], days[6]);
  return <TimeGrid key={start} days={days} items={items} showHeader />;
}
