"use client";
/**
 * Avui: la visió general del dia. Esdeveniments i tasques junts, primer els de tot el dia,
 * després la línia cronològica amb un marcador d'"ara". També mostra les tasques
 * endarrerides, les que falten per programar i un resum de la setmana.
 */
import { useMemo } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { useItems, useStore } from "@/lib/data/store";
import { taskViews } from "@/lib/data/tasks";
import { useNow, useTodayKey } from "@/lib/ui/hooks";
import { openEditor, setDate, setView, useUI } from "@/lib/ui/state";
import { addDaysKey, capitalize, fmt, parseDayKey, relativeDayLabel } from "@/lib/time/dates";
import { itemsByDay } from "@/lib/recurrence/occurrences";
import { ItemRow } from "../calendar/ItemRow";
import { TaskRow } from "../tasks/TaskRow";
import { QuickAdd } from "../tasks/TasksScreen";
import { Button } from "../ui/primitives";
import { cn } from "@/lib/cn";
import type { CalendarItem } from "@/lib/types";

export function TodayScreen() {
  const today = useTodayKey();
  const now = useNow();
  const showCompleted = useUI((s) => s.prefs.showCompleted);
  const all = useItems(today, today);
  const items = useMemo(() => (showCompleted ? all : all.filter((i) => !i.completed)), [all, showCompleted]);
  const { dataset, subtasksByTask, ready } = useStore();
  const views = useMemo(() => taskViews(dataset, subtasksByTask, today), [dataset, subtasksByTask, today]);
  const overdue = views.filter((v) => v.overdue && !v.completed);
  const inbox = views.filter((v) => !v.completed && !v.date && !v.overdue).sort((a, b) => a.task.sort_order - b.task.sort_order);

  const allDay = items.filter((i) => i.allDay || (i.startDay < today && i.endDay > today));
  const timed = items.filter((i) => !allDay.includes(i));
  const nowIndex = timed.findIndex((i) => i.start > now);
  const pendingTasks = items.filter((i) => i.kind === "task" && !i.completed).length;
  const events = items.filter((i) => i.kind === "event").length;
  const doneTasks = all.filter((i) => i.kind === "task" && i.completed).length;
  const totalTasks = all.filter((i) => i.kind === "task").length;

  const date = parseDayKey(today);

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-grouped md:bg-bg dark:bg-bg">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-safe pb-32 md:grid-cols-[minmax(0,1fr)_320px] md:px-8 md:pb-12 lg:gap-12">
        <div className="min-w-0">
          <header className="pt-4 md:pt-8">
            <p className="text-[13px] font-semibold tracking-wide text-accent uppercase">{capitalize(fmt(date, "EEEE"))}</p>
            <h1 className="text-[32px] leading-tight font-bold tracking-tight md:text-[36px]">{capitalize(fmt(date, "d MMMM"))}</h1>
            <p className="mt-1 text-[14px] text-text-2">{summary(events, pendingTasks)}</p>
            {totalTasks > 0 && (
              <div className="mt-3 flex items-center gap-2" aria-label={`${doneTasks} de ${totalTasks} tasques fetes`}>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-fill">
                  <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
                </div>
                <span className="tabular text-[12px] text-text-3">
                  {doneTasks}/{totalTasks} tasques
                </span>
              </div>
            )}
          </header>

          <QuickAdd date={today} placeholder="Afegeix una tasca per avui" />

          {ready && !items.length && !overdue.length && (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="text-[15px] text-text-2">Cap esdeveniment ni tasca per avui.</p>
              <Button variant="tinted" onClick={() => openEditor({ type: "event", mode: "create", initial: { startDay: today, endDay: today } })}>
                <CalendarPlus className="size-4" /> Nou esdeveniment
              </Button>
            </div>
          )}

          {overdue.length > 0 && (
            <Block title="Endarrerides" tone="danger" count={overdue.length}>
              {overdue.map((v) => (
                <TaskRow key={v.task.id} v={v} draggable={false} />
              ))}
            </Block>
          )}

          {allDay.length > 0 && (
            <Block title="Tot el dia" count={allDay.length}>
              {allDay.map((it) => (
                <ItemRow key={it.key} item={it} day={today} />
              ))}
            </Block>
          )}

          {timed.length > 0 && (
            <Block title="Agenda" count={timed.length}>
              {timed.map((it, i) => (
                <div key={it.key} className={cn(isPast(it, now) && !it.completed && "opacity-60")}>
                  {i === nowIndex && <NowMarker now={now} />}
                  <ItemRow item={it} day={today} />
                </div>
              ))}
              {nowIndex === -1 && timed.length > 0 && <NowMarker now={now} />}
            </Block>
          )}
        </div>

        <aside className="space-y-6 md:pt-8">
          {inbox.length > 0 && (
            <Block title="Per programar" count={inbox.length} action={<Link href="/tasks" className="text-[13px] text-accent">Totes</Link>}>
              {inbox.slice(0, 6).map((v) => (
                <TaskRow key={v.task.id} v={v} draggable={false} />
              ))}
            </Block>
          )}
          <WeekAhead today={today} />
        </aside>
      </div>
    </div>
  );
}

function summary(events: number, tasks: number) {
  const parts = [];
  if (events) parts.push(`${events} ${events === 1 ? "esdeveniment" : "esdeveniments"}`);
  if (tasks) parts.push(`${tasks} ${tasks === 1 ? "tasca pendent" : "tasques pendents"}`);
  return parts.length ? parts.join(" · ") : "Dia lliure";
}

function isPast(it: CalendarItem, now: Date) {
  return (it.end > it.start ? it.end : it.start) < now;
}

function NowMarker({ now }: { now: Date }) {
  return (
    <div className="flex items-center gap-2 px-4 py-1" aria-label="Ara">
      <span className="tabular text-[11px] font-semibold text-accent">{`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}</span>
      <span className="h-px flex-1 bg-accent" />
    </div>
  );
}

function Block({ title, count, children, tone, action }: { title: string; count?: number; children: React.ReactNode; tone?: "danger"; action?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-1.5 flex items-baseline gap-2 px-1">
        <h2 className={cn("text-[15px] font-semibold", tone === "danger" && "text-danger")}>{title}</h2>
        {count != null && <span className="tabular text-[13px] text-text-3">{count}</span>}
        <span className="flex-1" />
        {action}
      </div>
      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-surface md:border md:border-separator dark:md:border-transparent">{children}</div>
    </section>
  );
}

function WeekAhead({ today }: { today: string }) {
  const end = addDaysKey(today, 7);
  const from = addDaysKey(today, 1);
  const items = useItems(from, end);
  const byDay = useMemo(() => itemsByDay(items.filter((i) => !i.completed), from, end), [items, from, end]);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(from, i));
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Propers dies</h2>
        <Link
          href="/calendar"
          onClick={() => {
            setDate(today);
            setView("week");
          }}
          className="text-[13px] text-accent"
        >
          Setmana
        </Link>
      </div>
      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-surface md:border md:border-separator dark:md:border-transparent">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <Link
              key={d}
              href="/calendar"
              onClick={() => {
                setDate(d);
                setView("day");
              }}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-fill/50"
            >
              <div className="w-20 shrink-0 text-[13px] font-medium">{relativeDayLabel(d)}</div>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {list.length === 0 ? (
                  <span className="text-[13px] text-text-3">—</span>
                ) : (
                  <>
                    <span className="flex -space-x-0.5">
                      {list.slice(0, 5).map((it) => (
                        <span key={it.key} className="size-2 rounded-full ring-2 ring-surface" style={{ background: it.color }} />
                      ))}
                    </span>
                    <span className="truncate text-[13px] text-text-2">{list[0].title}</span>
                    {list.length > 1 && <span className="shrink-0 text-[12px] text-text-3">+{list.length - 1}</span>}
                  </>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-text-3" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
