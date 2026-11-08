"use client";
import { useEffect, useMemo, useState } from "react";
import { AlignLeft, Clock, MapPin } from "lucide-react";
import { Sheet, SheetHeader } from "../ui/Sheet";
import { Group, PillInput, Row, Switch, TextArea, TextInput } from "../ui/primitives";
import { askScope, toast } from "../ui/feedback";
import { CategoryRow, RecurrenceRows, RemindersRows } from "./pickers";
import * as repo from "@/lib/db/repo";
import type { EventDraft } from "@/lib/db/repo";
import type { CalendarItem, EditScope } from "@/lib/types";
import { closeEditor, getUI } from "@/lib/ui/state";
import { deleteItem } from "@/lib/ui/actions";
import { dayKey, fmtTime, parseDayKey, todayKey } from "@/lib/time/dates";
import { wallFromParts } from "@/lib/time/tz";
import { useStore } from "@/lib/data/store";

function defaultDraft(initial?: Partial<EventDraft>): EventDraft {
  const prefs = getUI().prefs;
  const now = new Date();
  const day = initial?.startDay ?? todayKey();
  let start = initial?.start;
  if (!start) {
    start = parseDayKey(day);
    const h = day === todayKey() ? Math.min(23, now.getHours() + 1) : 9;
    start.setHours(h, 0, 0, 0);
  }
  return {
    title: "",
    description: null,
    location: null,
    category_id: null,
    all_day: false,
    startDay: dayKey(start),
    endDay: dayKey(start),
    rrule: null,
    reminders: prefs.defaultReminders,
    ...initial,
    start,
    end: initial?.end ?? new Date(start.getTime() + prefs.defaultDuration * 60000),
  };
}

function withTime(day: string, time: string): Date {
  const d = parseDayKey(day);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function EventEditor({ mode, item, initial }: { mode: "create" | "edit"; item?: CalendarItem; initial?: Partial<EventDraft> }) {
  const { categories } = useStore();
  const [draft, setDraft] = useState<EventDraft | null>(mode === "create" ? defaultDraft({ category_id: categories[0]?.id ?? null, ...initial }) : null);
  const [original, setOriginal] = useState<EventDraft | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !item) return;
    void repo.eventDraftFor(item).then((r) => {
      if (!r) return closeEditor();
      setDraft(r.draft);
      setOriginal(r.draft);
    });
  }, [mode, item]);

  const startWall = useMemo(() => {
    if (!draft) return new Date();
    const d = parseDayKey(draft.all_day ? draft.startDay : dayKey(draft.start));
    return wallFromParts(d.getFullYear(), d.getMonth(), d.getDate());
  }, [draft]);

  if (!draft) return null;

  const set = (patch: Partial<EventDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const startDay = draft.all_day ? draft.startDay : dayKey(draft.start);
  const endDay = draft.all_day ? draft.endDay : dayKey(draft.end ?? draft.start);
  const invalid = draft.all_day ? draft.endDay < draft.startDay : !!draft.end && draft.end < draft.start;
  const isRecurringEdit = mode === "edit" && !!item?.recurring && !!item.occurrenceKey;
  const ruleChanged = original ? original.rrule !== draft.rrule : false;

  const changeStartDay = (v: string) => {
    if (!v) return;
    if (draft.all_day) {
      const len = Math.max(0, Math.round((parseDayKey(draft.endDay).getTime() - parseDayKey(draft.startDay).getTime()) / 86400000));
      set({ startDay: v, endDay: dayKey(new Date(parseDayKey(v).getTime() + len * 86400000 + 3600000)) });
    } else {
      const s = withTime(v, fmtTime(draft.start));
      const dur = draft.end ? draft.end.getTime() - draft.start.getTime() : 0;
      set({ start: s, end: draft.end ? new Date(s.getTime() + dur) : null, startDay: v });
    }
  };
  const changeStartTime = (v: string) => {
    if (!v) return;
    const s = withTime(dayKey(draft.start), v);
    const dur = draft.end ? draft.end.getTime() - draft.start.getTime() : 0;
    set({ start: s, end: draft.end ? new Date(s.getTime() + dur) : null });
  };
  const toggleAllDay = (v: boolean) => {
    if (v) set({ all_day: true, startDay: dayKey(draft.start), endDay: dayKey(draft.end ?? draft.start) });
    else {
      const s = withTime(draft.startDay, "09:00");
      set({ all_day: false, start: s, end: new Date(s.getTime() + getUI().prefs.defaultDuration * 60000) });
    }
  };

  const save = async () => {
    if (invalid) return;
    const clean = { ...draft, title: draft.title.trim() || "Nou esdeveniment" };
    if (mode === "create") {
      await repo.createEvent(clean);
      toast("Esdeveniment creat");
      closeEditor();
      return;
    }
    let scope: EditScope = "all";
    if (isRecurringEdit) {
      const s = await askScope("edit", "event", !ruleChanged);
      if (!s) return;
      scope = s;
    }
    await repo.saveEvent(item!, clean, scope);
    closeEditor();
  };

  const onDelete = async () => {
    if (!item) return;
    if (await deleteItem(item)) closeEditor();
  };

  return (
    <Sheet open label={mode === "create" ? "Nou esdeveniment" : "Edita l'esdeveniment"} onClose={closeEditor}>
      <SheetHeader title={mode === "create" ? "Nou esdeveniment" : "Esdeveniment"} onCancel={closeEditor} onDone={save} doneLabel={mode === "create" ? "Afegeix" : "Fet"} doneDisabled={invalid} />
      <form
        className="scroll-thin flex-1 space-y-5 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Group>
          <div className="px-4 py-2.5">
            <TextInput data-autofocus value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Títol" aria-label="Títol" className="text-[17px] font-medium" maxLength={300} />
          </div>
          <Row icon={<MapPin className="size-[18px]" />}>
            <TextInput value={draft.location ?? ""} onChange={(e) => set({ location: e.target.value })} placeholder="Ubicació" aria-label="Ubicació" className="text-[15px] text-text" />
          </Row>
        </Group>

        <Group>
          <Row label="Tot el dia" icon={<Clock className="size-[18px]" />}>
            <Switch checked={draft.all_day} onChange={toggleAllDay} label="Tot el dia" />
          </Row>
          <Row label="Inici">
            <PillInput type="date" value={startDay} onChange={(e) => changeStartDay(e.target.value)} aria-label="Data d'inici" required />
            {!draft.all_day && <PillInput type="time" value={fmtTime(draft.start)} onChange={(e) => changeStartTime(e.target.value)} aria-label="Hora d'inici" required step={300} />}
          </Row>
          <Row label="Final">
            {draft.all_day || draft.end ? (
              <>
                <PillInput
                  type="date"
                  value={endDay}
                  min={startDay}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (draft.all_day) set({ endDay: v });
                    else set({ end: withTime(v, fmtTime(draft.end ?? draft.start)) });
                  }}
                  aria-label="Data final"
                  className={invalid ? "text-danger line-through" : undefined}
                />
                {!draft.all_day && draft.end && (
                  <PillInput type="time" value={fmtTime(draft.end)} onChange={(e) => e.target.value && set({ end: withTime(dayKey(draft.end!), e.target.value) })} aria-label="Hora final" step={300} className={invalid ? "text-danger line-through" : undefined} />
                )}
                {!draft.all_day && (
                  <button type="button" onClick={() => set({ end: null })} className="text-[13px] text-text-3 hover:text-text" aria-label="Sense hora final">
                    Treu
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => set({ end: new Date(draft.start.getTime() + 3600000) })} className="text-[15px] text-accent">
                Afegeix hora final
              </button>
            )}
          </Row>
          <RecurrenceRows value={draft.rrule} onChange={(r) => set({ rrule: r })} startWall={startWall} />
        </Group>

        <Group>
          <CategoryRow value={draft.category_id} onChange={(v) => set({ category_id: v })} />
        </Group>

        <Group footer={isRecurringEdit ? "Els recordatoris s'apliquen a tota la sèrie." : undefined}>
          <RemindersRows value={draft.reminders} onChange={(v) => set({ reminders: v })} allDay={draft.all_day} />
        </Group>

        <Group>
          <div className="flex gap-3 px-4 py-3">
            <AlignLeft className="mt-0.5 size-[18px] shrink-0 text-text-2" />
            <TextArea value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="Notes" aria-label="Descripció" rows={3} className="text-[15px]" />
          </div>
        </Group>

        {mode === "edit" && (
          <Group>
            <button type="button" onClick={onDelete} className="h-11 w-full text-[15px] text-danger hover:bg-fill/50">
              Elimina l&apos;esdeveniment
            </button>
          </Group>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
