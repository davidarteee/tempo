"use client";
import { useState, useSyncExternalStore } from "react";
import { CalendarArrowUp, CalendarDays, Moon, Sun, Sunrise, X } from "lucide-react";
import { Sheet, SheetHeader } from "../ui/Sheet";
import { Group, PillInput, Row, Switch } from "../ui/primitives";
import { MiniMonth } from "../calendar/MiniMonth";
import { addDaysKey, dayKey, parseDayKey, relativeDayLabel, todayKey } from "@/lib/time/dates";
import { scheduleTask } from "@/lib/db/repo";
import { toast } from "../ui/feedback";

/** Full ràpid per assignar data (i hora opcional) a una tasca */
let req: { taskId: string; occurrenceKey: string | null; date: string | null; time: string | null; title: string } | null = null;
const ls = new Set<() => void>();
export function openSchedule(r: NonNullable<typeof req>) {
  req = r;
  ls.forEach((l) => l());
}
function close() {
  req = null;
  ls.forEach((l) => l());
}

export function ScheduleHost() {
  const r = useSyncExternalStore(
    (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    () => req,
    () => null,
  );
  if (!r) return null;
  return <ScheduleSheet key={r.taskId + (r.occurrenceKey ?? "")} r={r} />;
}

function ScheduleSheet({ r }: { r: NonNullable<typeof req> }) {
  const [date, setDate] = useState(r.date ?? todayKey());
  const [time, setTime] = useState<string | null>(r.time);
  const today = todayKey();
  const sat = (() => {
    const d = parseDayKey(today);
    const diff = (6 - d.getDay() + 7) % 7 || 7;
    return addDaysKey(today, d.getDay() === 6 ? 0 : diff);
  })();
  const nextMon = (() => {
    const d = parseDayKey(today);
    return addDaysKey(today, ((8 - d.getDay()) % 7) || 7);
  })();

  const apply = async (d: string | null, t: string | null) => {
    await scheduleTask(r.taskId, r.occurrenceKey, d, t);
    toast(d ? `Programada per ${relativeDayLabel(d).toLowerCase()}${t ? ` a les ${t}` : ""}` : "Data eliminada");
    close();
  };

  const quick = [
    { label: "Avui", icon: <Sun className="size-[18px]" />, d: today },
    { label: "Demà", icon: <Sunrise className="size-[18px]" />, d: addDaysKey(today, 1) },
    { label: "Aquest cap de setmana", icon: <Moon className="size-[18px]" />, d: sat },
    { label: "La setmana vinent", icon: <CalendarArrowUp className="size-[18px]" />, d: nextMon },
  ];

  return (
    <Sheet open size="sm" label="Programa la tasca" onClose={close}>
      <SheetHeader title="Programa" onCancel={close} onDone={() => void apply(date, time)} doneLabel="Desa" />
      <div className="scroll-thin space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <p className="truncate px-1 text-center text-[13px] text-text-2">{r.title}</p>
        <Group>
          {quick.map((q) => (
            <Row key={q.label} label={q.label} icon={q.icon} onClick={() => void apply(q.d, time)}>
              <span className="text-[13px]">{relativeDayLabel(q.d)}</span>
            </Row>
          ))}
        </Group>
        <Group>
          <div className="p-3">
            <MiniMonth value={date} onSelect={setDate} />
          </div>
          <Row label="Hora" icon={<CalendarDays className="size-[18px]" />}>
            {time && <PillInput type="time" step={300} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} aria-label="Hora" />}
            <Switch label="Amb hora" checked={!!time} onChange={(v) => setTime(v ? "09:00" : null)} />
          </Row>
        </Group>
        {r.date && (
          <Group>
            <Row label="Treu la data" icon={<X className="size-[18px]" />} onClick={() => void apply(null, null)} className="text-danger" />
          </Group>
        )}
        <p className="text-center text-[12px] text-text-3">{dayKey(parseDayKey(date)) === date && relativeDayLabel(date)}</p>
      </div>
    </Sheet>
  );
}
