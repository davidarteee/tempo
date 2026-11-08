"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, CalendarDays, Clock, Flag, Plus, Timer, X } from "lucide-react";
import { Sheet, SheetHeader } from "../ui/Sheet";
import { Group, NativeSelect, PillInput, Row, Switch, TaskCheck, TextArea, TextInput } from "../ui/primitives";
import { askScope, toast } from "../ui/feedback";
import { CategoryRow, RecurrenceRows, RemindersRows } from "./pickers";
import * as repo from "@/lib/db/repo";
import type { TaskDraft } from "@/lib/db/repo";
import type { EditScope } from "@/lib/types";
import { closeEditor } from "@/lib/ui/state";
import { deleteItem, toggleComplete } from "@/lib/ui/actions";
import { todayKey, parseDayKey, durationLabel } from "@/lib/time/dates";
import { wallFromParts } from "@/lib/time/tz";
import { useStore } from "@/lib/data/store";
import { cn } from "@/lib/cn";

const EMPTY: TaskDraft = { title: "", description: null, category_id: null, due_date: null, scheduled_date: null, scheduled_time: null, duration_minutes: 30, rrule: null, reminders: [] };
const DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240];

export function TaskEditor({ mode, taskId, occurrenceKey, initial }: { mode: "create" | "edit"; taskId?: string; occurrenceKey?: string | null; initial?: Partial<TaskDraft> }) {
  const { subtasksByTask, dataset, categories } = useStore();
  const [draft, setDraft] = useState<TaskDraft | null>(mode === "create" ? { ...EMPTY, category_id: categories[0]?.id ?? null, ...initial } : null);
  const [original, setOriginal] = useState<TaskDraft | null>(null);
  const [newSubs, setNewSubs] = useState<string[]>([]);
  const [subInput, setSubInput] = useState("");
  const subRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "edit" || !taskId) return;
    void repo.taskDraftFor(taskId, occurrenceKey ?? null).then((r) => {
      if (!r) return closeEditor();
      setDraft(r.draft);
      setOriginal(r.draft);
    });
  }, [mode, taskId, occurrenceKey]);

  const task = taskId ? dataset.tasks.find((t) => t.id === taskId) : undefined;
  const completed = useMemo(() => {
    if (!task) return false;
    if (task.rrule && occurrenceKey) return !!dataset.taskExceptions.get(task.id)?.get(occurrenceKey)?.completed_at;
    return !!task.completed_at;
  }, [task, occurrenceKey, dataset]);

  const startWall = useMemo(() => {
    const d = parseDayKey(draft?.scheduled_date ?? todayKey());
    return wallFromParts(d.getFullYear(), d.getMonth(), d.getDate());
  }, [draft?.scheduled_date]);

  if (!draft) return null;
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const subs = taskId ? (subtasksByTask.get(taskId) ?? []) : [];
  const isRecurringEdit = mode === "edit" && !!task?.rrule && !!occurrenceKey;
  const ruleChanged = original ? original.rrule !== draft.rrule : false;
  const color = categories.find((c) => c.id === draft.category_id)?.color ?? "#8E8E93";

  const save = async () => {
    const clean = { ...draft, title: draft.title.trim() };
    if (!clean.title) return;
    if (mode === "create") {
      await repo.createTask(clean, newSubs);
      toast(clean.scheduled_date ? "Tasca programada" : "Tasca afegida");
      closeEditor();
      return;
    }
    let scope: EditScope = "all";
    if (isRecurringEdit) {
      // Canvis que només tenen sentit per a la sèrie (descripció, durada, categoria...) no admeten "només aquesta"
      const seriesOnly = !original || original.description !== clean.description || original.category_id !== clean.category_id || original.duration_minutes !== clean.duration_minutes || original.due_date !== clean.due_date || original.reminders.join() !== clean.reminders.join() || ruleChanged;
      const s = await askScope("edit", "task", !seriesOnly);
      if (!s) return;
      scope = s;
    }
    await repo.saveTask(taskId!, occurrenceKey ?? null, clean, scope);
    closeEditor();
  };

  const addSub = async () => {
    const t = subInput.trim();
    if (!t) return;
    if (mode === "create") setNewSubs((s) => [...s, t]);
    else await repo.addSubtask(taskId!, t);
    setSubInput("");
    subRef.current?.focus();
  };

  const onDelete = async () => {
    if (!task) return;
    const ok = await deleteItem({
      key: "",
      kind: "task",
      sourceId: task.id,
      occurrenceKey: occurrenceKey ?? null,
      recurring: !!task.rrule,
      title: task.title,
      location: null,
      categoryId: task.category_id,
      color,
      allDay: true,
      start: new Date(),
      end: new Date(),
      startDay: "",
      endDay: "",
      completed,
      isFirstOccurrence: occurrenceKey === task.scheduled_date,
    });
    if (ok) closeEditor();
  };

  return (
    <Sheet open label={mode === "create" ? "Nova tasca" : "Edita la tasca"} onClose={closeEditor}>
      <SheetHeader title={mode === "create" ? "Nova tasca" : "Tasca"} onCancel={closeEditor} onDone={save} doneLabel={mode === "create" ? "Afegeix" : "Fet"} doneDisabled={!draft.title.trim()} />
      <form
        className="scroll-thin flex-1 space-y-5 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Group>
          <div className="flex items-center gap-3 px-4 py-2.5">
            {mode === "edit" && task && (
              <TaskCheck
                checked={completed}
                color={color}
                label={completed ? "Desmarcar" : "Marcar com a feta"}
                onChange={() => void toggleComplete({ sourceId: task.id, occurrenceKey: task.rrule ? (occurrenceKey ?? null) : null, completed, title: task.title })}
              />
            )}
            <TextInput data-autofocus value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Què has de fer?" aria-label="Títol" className={cn("text-[17px] font-medium", completed && "text-text-3 line-through")} maxLength={300} />
          </div>
          <div className="flex gap-3 px-4 py-2.5">
            <AlignLeft className="mt-0.5 size-[18px] shrink-0 text-text-2" />
            <TextArea value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="Notes" aria-label="Descripció" rows={2} className="text-[15px]" />
          </div>
        </Group>

        <Group title="Subtasques" footer={isRecurringEdit && subs.length ? "Les subtasques són compartides per totes les ocurrències." : undefined}>
          {subs.map((s) => (
            <div key={s.id} className="group flex min-h-[44px] items-center gap-3 px-4">
              <TaskCheck checked={s.done} color={color} size={18} label={s.done ? "Desmarcar subtasca" : "Completar subtasca"} onChange={() => void repo.updateSubtask(s.id, { done: !s.done })} />
              <input
                defaultValue={s.title}
                aria-label="Subtasca"
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && void repo.updateSubtask(s.id, { title: e.target.value.trim() })}
                className={cn("min-w-0 flex-1 bg-transparent text-[15px] outline-none", s.done && "text-text-3 line-through")}
              />
              <button type="button" aria-label="Elimina la subtasca" onClick={() => void repo.deleteSubtask(s.id)} className="rounded-full p-1 text-text-3 opacity-60 hover:bg-fill hover:text-text group-hover:opacity-100">
                <X className="size-4" />
              </button>
            </div>
          ))}
          {newSubs.map((s, i) => (
            <div key={i} className="flex min-h-[44px] items-center gap-3 px-4">
              <TaskCheck checked={false} color={color} size={18} label="Subtasca" onChange={() => {}} />
              <span className="flex-1 text-[15px]">{s}</span>
              <button type="button" aria-label="Elimina la subtasca" onClick={() => setNewSubs((x) => x.filter((_, j) => j !== i))} className="rounded-full p-1 text-text-3 hover:bg-fill">
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex min-h-[44px] items-center gap-3 px-4">
            <Plus className="size-[18px] text-text-3" />
            <input
              ref={subRef}
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addSub();
                }
              }}
              onBlur={() => void addSub()}
              placeholder="Afegeix una subtasca"
              aria-label="Nova subtasca"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
            />
          </div>
        </Group>

        <Group title="Programació" footer={!draft.scheduled_date ? "Sense data, la tasca queda a la safata de Tasques fins que la programis." : undefined}>
          <Row label="Data" icon={<CalendarDays className="size-[18px]" />}>
            {draft.scheduled_date && <PillInput type="date" value={draft.scheduled_date} onChange={(e) => e.target.value && set({ scheduled_date: e.target.value })} aria-label="Data programada" />}
            <Switch
              label="Assigna una data"
              checked={!!draft.scheduled_date}
              onChange={(v) => set(v ? { scheduled_date: todayKey() } : { scheduled_date: null, scheduled_time: null, rrule: null, reminders: [] })}
            />
          </Row>
          {draft.scheduled_date && (
            <Row label="Hora" icon={<Clock className="size-[18px]" />}>
              {draft.scheduled_time && <PillInput type="time" step={300} value={draft.scheduled_time} onChange={(e) => e.target.value && set({ scheduled_time: e.target.value })} aria-label="Hora programada" />}
              <Switch label="Assigna una hora" checked={!!draft.scheduled_time} onChange={(v) => set({ scheduled_time: v ? nextHalfHour() : null })} />
            </Row>
          )}
          {draft.scheduled_time && (
            <Row label="Durada" icon={<Timer className="size-[18px]" />}>
              <NativeSelect label="Durada" value={String(draft.duration_minutes)} onChange={(v) => set({ duration_minutes: Number(v) })}>
                {(DURATIONS.includes(draft.duration_minutes) ? DURATIONS : [...DURATIONS, draft.duration_minutes].sort((a, b) => a - b)).map((d) => (
                  <option key={d} value={d}>
                    {durationLabel(d)}
                  </option>
                ))}
              </NativeSelect>
            </Row>
          )}
          {draft.scheduled_date && <RecurrenceRows value={draft.rrule} onChange={(r) => set({ rrule: r })} startWall={startWall} />}
          <Row label="Data límit" icon={<Flag className="size-[18px]" />}>
            {draft.due_date && <PillInput type="date" value={draft.due_date} onChange={(e) => e.target.value && set({ due_date: e.target.value })} aria-label="Data límit" />}
            <Switch label="Data límit" checked={!!draft.due_date} onChange={(v) => set({ due_date: v ? (draft.scheduled_date ?? todayKey()) : null })} />
          </Row>
        </Group>

        <Group>
          <CategoryRow value={draft.category_id} onChange={(v) => set({ category_id: v })} />
        </Group>

        <Group>
          <RemindersRows value={draft.reminders} onChange={(v) => set({ reminders: v })} allDay={!draft.scheduled_time} disabledReason={!draft.scheduled_date ? "Assigna una data per afegir-ne" : undefined} />
        </Group>

        {mode === "edit" && (
          <Group>
            <button type="button" onClick={onDelete} className="h-11 w-full text-[15px] text-danger hover:bg-fill/50">
              Elimina la tasca
            </button>
          </Group>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function nextHalfHour() {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  const n = Math.min(23 * 60 + 30, Math.ceil((m + 1) / 30) * 30);
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
