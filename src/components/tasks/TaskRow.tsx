"use client";
import { memo } from "react";
import { CalendarClock, Flag, ListChecks, Repeat } from "lucide-react";
import type { TaskView } from "@/lib/data/tasks";
import { TaskCheck } from "../ui/primitives";
import { toggleComplete } from "@/lib/ui/actions";
import { openEditor } from "@/lib/ui/state";
import { relativeDayLabel, todayKey } from "@/lib/time/dates";
import { dragHandle } from "@/lib/ui/drag";
import { scheduleTask } from "@/lib/db/repo";
import { openSchedule } from "./ScheduleSheet";
import { cn } from "@/lib/cn";
import { toast } from "../ui/feedback";

/** Fila de tasca. Es pot arrossegar fins al calendari per programar-la. */
export const TaskRow = memo(function TaskRow({ v, draggable = true }: { v: TaskView; draggable?: boolean }) {
  const { task } = v;
  const today = todayKey();
  const open = () => openEditor({ type: "task", mode: "edit", taskId: task.id, occurrenceKey: v.occurrenceKey });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!draggable || v.completed) return;
    dragHandle(e, () => ({
      label: task.title,
      color: v.color,
      durationMin: task.duration_minutes,
      onDrop: (t) => {
        const time = t.minutes == null ? (t.keepTime ? v.time : null) : `${String(Math.floor(t.minutes / 60)).padStart(2, "0")}:${String(t.minutes % 60).padStart(2, "0")}`;
        void scheduleTask(task.id, v.occurrenceKey, t.day, time).then(() => toast(`Programada per ${relativeDayLabel(t.day).toLowerCase()}${time ? ` a les ${time}` : ""}`));
      },
    }));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onPointerDown={onPointerDown}
      className={cn("group flex min-h-[50px] cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors select-none [-webkit-touch-callout:none] hover:bg-fill/50 active:bg-fill", v.completed && "item-completed")}
    >
      <span className="pt-[1px]">
        <TaskCheck checked={v.completed} color={v.color} label={`${v.completed ? "Desmarcar" : "Completar"} ${task.title}`} onChange={() => void toggleComplete({ sourceId: task.id, occurrenceKey: v.occurrenceKey, completed: v.completed, title: task.title })} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="item-title text-[15px] leading-snug">{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-text-2 empty:hidden">
          {v.date && !v.completed && (
            <span className={cn("flex items-center gap-1", v.overdue ? "text-danger" : v.date === today && "text-accent")}>
              {relativeDayLabel(v.date)}
              {v.time && `, ${v.time}`}
            </span>
          )}
          {v.completed && v.completedAt && <span>Feta {relativeDayLabel(v.completedAt.slice(0, 10)).toLowerCase()}</span>}
          {task.due_date && !v.completed && (
            <span className={cn("flex items-center gap-0.5", task.due_date < today && "text-danger")}>
              <Flag className="size-3" /> {relativeDayLabel(task.due_date)}
            </span>
          )}
          {v.subTotal > 0 && (
            <span className="tabular flex items-center gap-0.5">
              <ListChecks className="size-3" /> {v.subDone}/{v.subTotal}
            </span>
          )}
          {task.rrule && <Repeat className="size-3" aria-label="Recurrent" />}
          {v.category && (
            <span className="flex items-center gap-1">
              <span className="size-[7px] rounded-full" style={{ background: v.color }} />
              {v.category.name}
            </span>
          )}
        </div>
      </div>
      {!v.completed && (
        <button
          type="button"
          aria-label={v.date ? "Canvia la data" : "Programa"}
          title={v.date ? "Canvia la data" : "Programa"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openSchedule({ taskId: task.id, occurrenceKey: v.occurrenceKey, date: v.date, time: v.time, title: task.title });
          }}
          className={cn("-mr-1 rounded-full p-1.5 text-text-3 transition-opacity hover:bg-fill hover:text-text", v.date && "md:opacity-0 md:group-hover:opacity-100")}
        >
          <CalendarClock className="size-[18px]" />
        </button>
      )}
    </div>
  );
});
