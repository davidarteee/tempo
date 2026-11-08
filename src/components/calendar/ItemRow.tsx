"use client";
import { memo } from "react";
import type { CalendarItem } from "@/lib/types";
import { fmtTime, durationLabel } from "@/lib/time/dates";
import { TaskCheck } from "../ui/primitives";
import { toggleComplete } from "@/lib/ui/actions";
import { openItem } from "./TimeGrid";
import { cn } from "@/lib/cn";
import { MapPin, Repeat } from "lucide-react";

/** Fila de llista per a esdeveniments i tasques (vistes Avui, Agenda, llista del dia) */
export const ItemRow = memo(function ItemRow({ item, day, showDay }: { item: CalendarItem; day?: string; showDay?: string }) {
  const multiDay = item.startDay !== item.endDay;
  let timeTop = "";
  let timeBottom = "";
  if (item.allDay) {
    timeTop = "tot el dia";
  } else if (multiDay && day && day !== item.startDay) {
    timeTop = day === item.endDay ? "fins a" : "tot el dia";
    timeBottom = day === item.endDay ? fmtTime(item.end) : "";
  } else {
    timeTop = fmtTime(item.start);
    if (item.kind === "event" && item.end > item.start) timeBottom = multiDay ? "" : fmtTime(item.end);
    if (item.kind === "task") timeBottom = durationLabel(Math.round((item.end.getTime() - item.start.getTime()) / 60000));
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openItem(item)}
      onKeyDown={(e) => e.key === "Enter" && openItem(item)}
      className={cn("group flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-fill/50 active:bg-fill", item.completed && "item-completed")}
    >
      {item.kind === "task" ? (
        <TaskCheck checked={item.completed} color={item.color} label={`${item.completed ? "Desmarcar" : "Completar"} ${item.title}`} onChange={() => void toggleComplete(item)} />
      ) : (
        <span className="h-9 w-[4px] shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="item-title truncate text-[15px] leading-tight font-medium">{item.title}</div>
        <div className="mt-0.5 flex items-center gap-2 truncate text-[13px] text-text-2">
          {showDay && <span>{showDay}</span>}
          {item.kind === "task" && <span>Tasca</span>}
          {item.location && (
            <span className="flex min-w-0 items-center gap-0.5 truncate">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{item.location}</span>
            </span>
          )}
          {item.recurring && <Repeat className="size-3 shrink-0" aria-label="Recurrent" />}
        </div>
      </div>
      <div className="tabular shrink-0 text-right text-[13px] leading-tight">
        <div className="text-text">{timeTop}</div>
        {timeBottom && <div className="text-text-3">{timeBottom}</div>}
      </div>
    </div>
  );
});
