"use client";
import { useMemo, useState } from "react";
import { useItems } from "@/lib/data/store";
import { itemsByDay } from "@/lib/recurrence/occurrences";
import { addDaysKey, capitalize, fmt, parseDayKey, todayKey } from "@/lib/time/dates";
import { useUI } from "@/lib/ui/state";
import { ItemRow } from "./ItemRow";
import { cn } from "@/lib/cn";

/** Llista cronològica des de la data seleccionada; carrega més dies a demanda */
export function AgendaView({ date }: { date: string }) {
  const [span, setSpan] = useState(60);
  const end = addDaysKey(date, span - 1);
  const all = useItems(date, end);
  const showCompleted = useUI((s) => s.prefs.showCompleted);
  const items = useMemo(() => (showCompleted ? all : all.filter((i) => !i.completed)), [all, showCompleted]);
  const byDay = useMemo(() => itemsByDay(items, date, end), [items, date, end]);
  const days = useMemo(() => Array.from(byDay.keys()).sort(), [byDay]);
  const today = todayKey();

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      {!days.length && <p className="px-4 py-16 text-center text-[15px] text-text-3">No hi ha res programat els propers {span} dies.</p>}
      {days.map((d) => {
        const date = parseDayKey(d);
        return (
          <section key={d} className="border-b border-separator">
            <header className="sticky top-0 z-10 flex items-baseline gap-2 bg-bg/90 px-4 pt-3 pb-1.5 backdrop-blur-md">
              <span className={cn("text-[15px] font-semibold", d === today && "text-accent")}>{d === today ? "Avui" : capitalize(fmt(date, "EEEE"))}</span>
              <span className="text-[13px] text-text-3">{fmt(date, "d MMMM yyyy")}</span>
            </header>
            <div className="divide-y divide-separator">
              {byDay.get(d)!.map((it) => (
                <ItemRow key={it.key} item={it} day={d} />
              ))}
            </div>
          </section>
        );
      })}
      <div className="flex justify-center py-6 pb-28 md:pb-8">
        <button onClick={() => setSpan((s) => s + 60)} className="rounded-full bg-fill px-4 py-2 text-[13px] font-medium text-text-2 hover:bg-fill-strong hover:text-text">
          Mostra els {span < 365 ? "següents 60 dies" : "següents dies"}
        </button>
      </div>
    </div>
  );
}
