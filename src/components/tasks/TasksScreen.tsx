"use client";
import { useMemo, useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { sortByDate, taskViews, type TaskView } from "@/lib/data/tasks";
import { useTodayKey, useIsDesktop } from "@/lib/ui/hooks";
import { openEditor } from "@/lib/ui/state";
import { createTask } from "@/lib/db/repo";
import { capitalize, fmt, parseDayKey, relativeDayLabel } from "@/lib/time/dates";
import { Segmented } from "../ui/primitives";
import { TaskRow } from "./TaskRow";
import { cn } from "@/lib/cn";

type Filter = "pending" | "inbox" | "scheduled" | "done";

export function TasksScreen() {
  const { dataset, subtasksByTask, ready, categories } = useStore();
  const today = useTodayKey();
  const desktop = useIsDesktop();
  const [filter, setFilter] = useState<Filter>("pending");
  const [category, setCategory] = useState<string>("");
  const views = useMemo(() => taskViews(dataset, subtasksByTask, today), [dataset, subtasksByTask, today]);
  const filtered = useMemo(() => (category ? views.filter((v) => (category === "none" ? !v.task.category_id : v.task.category_id === category)) : views), [views, category]);

  const pending = filtered.filter((v) => !v.completed);
  const overdue = pending.filter((v) => v.overdue).sort(sortByDate);
  const inbox = pending.filter((v) => !v.date && !v.overdue).sort((a, b) => a.task.sort_order - b.task.sort_order);
  const scheduled = pending.filter((v) => v.date && !v.overdue).sort(sortByDate);
  const done = filtered.filter((v) => v.completed).sort((a, b) => ((b.completedAt ?? "") < (a.completedAt ?? "") ? -1 : 1));

  const scheduledGroups = useMemo(() => {
    const g = new Map<string, TaskView[]>();
    for (const v of scheduled) {
      const k = v.date!;
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(v);
    }
    return Array.from(g.entries());
  }, [scheduled]);

  const doneGroups = useMemo(() => {
    const g = new Map<string, TaskView[]>();
    for (const v of done) {
      const k = (v.completedAt ?? "").slice(0, 7) || "—";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(v);
    }
    return Array.from(g.entries());
  }, [done]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-grouped md:bg-bg dark:bg-bg">
      <header className="pt-safe shrink-0 bg-grouped/85 backdrop-blur-xl md:bg-bg/85 dark:bg-bg/85">
        <div className="flex items-end justify-between gap-3 px-4 pt-3 pb-2 md:px-8 md:pt-6">
          <div>
            <h1 className="text-[30px] leading-tight font-bold tracking-tight md:text-[32px]">Tasques</h1>
            <p className="text-[13px] text-text-2">
              {pending.length} pendents{inbox.length > 0 && ` · ${inbox.length} per programar`}
            </p>
          </div>
          <label className="relative flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] text-text-2">
            <SlidersHorizontal className="size-3.5" />
            <select aria-label="Filtra per categoria" value={category} onChange={(e) => setCategory(e.target.value)} className="appearance-none bg-transparent pr-1 outline-none">
              <option value="">Totes les categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="none">Sense categoria</option>
            </select>
          </label>
        </div>
        <div className="px-4 pb-2 md:px-8">
          <Segmented
            className="w-full md:w-auto"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Pendents" },
              { value: "inbox", label: `Sense data${inbox.length ? ` (${inbox.length})` : ""}` },
              { value: "scheduled", label: "Programades" },
              { value: "done", label: "Fetes" },
            ]}
          />
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-32 md:px-8 md:pb-10">
        <div className="mx-auto max-w-3xl">
          {filter !== "done" && <QuickAdd />}
          {!ready ? null : filter === "pending" ? (
            <>
              {overdue.length > 0 && <Section title="Endarrerides" tone="danger" items={overdue} />}
              <Section title="Sense data" hint={desktop ? "Arrossega-les al calendari o fes clic a la icona per programar-les." : "Toca la icona del calendari per programar-les."} items={inbox} empty="Cap tasca pendent de programar." />
              {scheduledGroups.map(([d, list]) => (
                <Section key={d} title={relativeDayLabel(d)} items={list} accent={d === today} />
              ))}
              {!pending.length && <Empty text="Tot fet. Res pendent." />}
            </>
          ) : filter === "inbox" ? (
            <Section title="Sense data" items={inbox} empty="Totes les tasques tenen una data assignada." />
          ) : filter === "scheduled" ? (
            <>
              {overdue.length > 0 && <Section title="Endarrerides" tone="danger" items={overdue} />}
              {scheduledGroups.map(([d, list]) => (
                <Section key={d} title={relativeDayLabel(d)} items={list} accent={d === today} />
              ))}
              {!scheduledGroups.length && !overdue.length && <Empty text="No hi ha tasques programades." />}
            </>
          ) : (
            <>
              {doneGroups.map(([m, list]) => (
                <Section key={m} title={m === "—" ? "Fetes" : capitalize(fmt(parseDayKey(`${m}-01`), "LLLL yyyy"))} items={list} />
              ))}
              {!done.length && <Empty text="Encara no has completat cap tasca." />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, hint, empty, tone, accent }: { title: string; items: TaskView[]; hint?: string; empty?: string; tone?: "danger"; accent?: boolean }) {
  if (!items.length && !empty) return null;
  return (
    <section className="mt-5">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <h2 className={cn("text-[15px] font-semibold", tone === "danger" && "text-danger", accent && "text-accent")}>{title}</h2>
        {items.length > 0 && <span className="tabular text-[13px] text-text-3">{items.length}</span>}
      </div>
      {hint && items.length > 0 && <p className="mb-1.5 px-1 text-[12px] text-text-3">{hint}</p>}
      {items.length ? (
        <div className="divide-y divide-separator overflow-hidden rounded-xl bg-surface md:border md:border-separator dark:md:border-transparent">
          {items.map((v) => (
            <TaskRow key={v.task.id} v={v} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-[13px] text-text-3">{empty}</p>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-16 text-center text-[15px] text-text-3">{text}</p>;
}

/** Afegir ràpid: Enter crea la tasca sense data; el botó + obre l'editor complet */
export function QuickAdd({ date, placeholder = "Nova tasca" }: { date?: string; placeholder?: string }) {
  const [title, setTitle] = useState("");
  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    await createTask({ title: t, description: null, category_id: null, due_date: null, scheduled_date: date ?? null, scheduled_time: null, duration_minutes: 30, rrule: null, reminders: [] });
  };
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface px-4 md:border md:border-separator dark:md:border-transparent">
      <button
        type="button"
        aria-label="Nova tasca amb detalls"
        onClick={() => openEditor({ type: "task", mode: "create", initial: { title, scheduled_date: date ?? null } })}
        className="flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-separator-strong text-text-3 hover:border-accent hover:text-accent"
      >
        <Plus className="size-3" strokeWidth={3} />
      </button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
        maxLength={300}
      />
      {title.trim() && (
        <button type="button" onClick={() => void submit()} className="text-[14px] font-semibold text-accent">
          Afegeix
        </button>
      )}
    </div>
  );
}
