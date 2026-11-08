"use client";
import { useMemo } from "react";
import { useItems } from "@/lib/data/store";
import { useUI } from "@/lib/ui/state";
import { ItemRow } from "./ItemRow";
import { relativeDayLabel } from "@/lib/time/dates";

/** Llista d'un dia: primer els elements de tot el dia, després els que tenen hora */
export function DayList({ day, emptyLabel = "Res programat" }: { day: string; emptyLabel?: string }) {
  const items = useItems(day, day);
  const showCompleted = useUI((s) => s.prefs.showCompleted);
  const visible = useMemo(() => (showCompleted ? items : items.filter((i) => !i.completed)), [items, showCompleted]);
  const allDay = visible.filter((i) => i.allDay || (i.startDay !== day && i.endDay !== day));
  const timed = visible.filter((i) => !allDay.includes(i));

  return (
    <div className="pb-24 md:pb-6">
      <div className="px-4 pt-3 pb-1 text-[13px] font-semibold text-text-2">{relativeDayLabel(day)}</div>
      {!visible.length && <p className="px-4 py-6 text-center text-[14px] text-text-3">{emptyLabel}</p>}
      {allDay.length > 0 && <div className="divide-y divide-separator">{allDay.map((it) => <ItemRow key={it.key} item={it} day={day} />)}</div>}
      {allDay.length > 0 && timed.length > 0 && <div className="mx-4 my-1 border-t border-separator" />}
      <div className="divide-y divide-separator">
        {timed.map((it) => (
          <ItemRow key={it.key} item={it} day={day} />
        ))}
      </div>
    </div>
  );
}
