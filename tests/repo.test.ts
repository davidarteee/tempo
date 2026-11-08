import { beforeEach, describe, expect, it } from "vitest";
import * as repo from "@/lib/db/repo";
import { db, wipeLocal } from "@/lib/db/local";
import { setUserId } from "@/lib/session";
import { buildItems, dayRange, groupExceptions, type Dataset } from "@/lib/recurrence/occurrences";

async function dataset(): Promise<Dataset> {
  const d = db();
  const [events, exc, tasks, texc, cats] = await Promise.all([d.events.toArray(), d.event_exceptions.toArray(), d.tasks.toArray(), d.task_exceptions.toArray(), d.categories.toArray()]);
  return {
    events: events.filter((e) => !e.deleted_at),
    eventExceptions: groupExceptions(exc, (x) => x.event_id),
    tasks: tasks.filter((t) => !t.deleted_at),
    taskExceptions: groupExceptions(texc, (x) => x.task_id),
    categories: new Map(cats.map((c) => [c.id, c])),
  };
}

async function items(from: string, to: string) {
  return buildItems(await dataset(), dayRange(from, to));
}

const base: repo.EventDraft = {
  title: "Classe",
  description: null,
  location: null,
  category_id: null,
  all_day: false,
  start: new Date(2026, 10, 2, 10, 0), // dl 2 nov, 10:00
  end: new Date(2026, 10, 2, 11, 0),
  startDay: "2026-11-02",
  endDay: "2026-11-02",
  rrule: "FREQ=WEEKLY",
  reminders: [],
};

beforeEach(async () => {
  await wipeLocal();
  setUserId("u1");
});

describe("sèries recurrents d'esdeveniments", () => {
  it("'només aquesta' crea una excepció sense tocar la sèrie", async () => {
    await repo.createEvent(base);
    const occ = (await items("2026-11-09", "2026-11-09"))[0];
    await repo.saveEvent(occ, { ...(await repo.eventDraftFor(occ))!.draft, title: "Examen" }, "this");
    const list = await items("2026-11-02", "2026-11-22");
    expect(list.map((i) => i.title)).toEqual(["Classe", "Examen", "Classe"]);
    expect(await db().events.count()).toBe(1);
  });

  it("'aquesta i les futures' divideix la sèrie", async () => {
    await repo.createEvent(base);
    const occ = (await items("2026-11-16", "2026-11-16"))[0];
    const draft = (await repo.eventDraftFor(occ))!.draft;
    await repo.saveEvent(occ, { ...draft, title: "Nou horari", start: new Date(2026, 10, 16, 12), end: new Date(2026, 10, 16, 13) }, "future");
    const list = await items("2026-11-02", "2026-11-30");
    expect(list.map((i) => `${i.title}@${i.start.getDate()}-${i.start.getHours()}`)).toEqual(["Classe@2-10", "Classe@9-10", "Nou horari@16-12", "Nou horari@23-12", "Nou horari@30-12"]);
    const events = await db().events.toArray();
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.title === "Nou horari")!.series_parent_id).toBe(events.find((e) => e.title === "Classe")!.id);
  });

  it("'totes' desplaça la sèrie i conserva les excepcions", async () => {
    await repo.createEvent(base);
    const third = (await items("2026-11-16", "2026-11-16"))[0];
    await repo.deleteEvent(third, "this");
    const second = (await items("2026-11-09", "2026-11-09"))[0];
    const draft = (await repo.eventDraftFor(second))!.draft;
    await repo.saveEvent(second, { ...draft, start: new Date(2026, 10, 9, 9), end: new Date(2026, 10, 9, 10) }, "all");
    const list = await items("2026-11-02", "2026-11-23");
    expect(list.map((i) => `${i.start.getDate()}-${i.start.getHours()}`)).toEqual(["2-9", "9-9", "23-9"]);
  });

  it("eliminar 'aquesta i les futures' acaba la sèrie; desfer-ho la recupera", async () => {
    await repo.createEvent(base);
    const occ = (await items("2026-11-16", "2026-11-16"))[0];
    const token = await repo.deleteEvent(occ, "future");
    expect((await items("2026-11-02", "2026-12-31")).length).toBe(2);
    await repo.undo(token);
    expect((await items("2026-11-02", "2026-11-30")).length).toBe(5);
  });

  it("arrossegar mou l'esdeveniment i conserva la durada", async () => {
    await repo.createEvent({ ...base, rrule: null });
    const [occ] = await items("2026-11-02", "2026-11-02");
    await repo.moveItem(occ, { day: "2026-11-04", minutes: 15 * 60 + 30 }, "all");
    const [moved] = await items("2026-11-04", "2026-11-04");
    expect([moved.start.getHours(), moved.start.getMinutes(), (moved.end.getTime() - moved.start.getTime()) / 60000]).toEqual([15, 30, 60]);
  });
});

describe("tasques", () => {
  it("es poden crear sense data i programar-se després", async () => {
    const t = await repo.createTask({ title: "Llegir", description: null, category_id: null, due_date: null, scheduled_date: null, scheduled_time: null, duration_minutes: 30, rrule: null, reminders: [] }, ["Capítol 1"]);
    expect(await items("2026-11-01", "2026-11-30")).toHaveLength(0);
    await repo.scheduleTask(t.id, null, "2026-11-10", "17:00");
    const [it] = await items("2026-11-10", "2026-11-10");
    expect([it.kind, it.allDay, it.start.getHours()]).toEqual(["task", false, 17]);
    expect(await db().task_subtasks.where("task_id").equals(t.id).count()).toBe(1);
  });

  it("completa una ocurrència d'una tasca recurrent sense afectar les altres", async () => {
    const t = await repo.createTask({ title: "Regar", description: null, category_id: null, due_date: null, scheduled_date: "2026-11-02", scheduled_time: null, duration_minutes: 30, rrule: "FREQ=DAILY", reminders: [] });
    await repo.toggleTaskComplete(t.id, "2026-11-03");
    expect((await items("2026-11-02", "2026-11-04")).map((i) => i.completed)).toEqual([false, true, false]);
  });

  it("encua els canvis a l'outbox una sola vegada per fila", async () => {
    const t = await repo.createTask({ title: "A", description: null, category_id: null, due_date: null, scheduled_date: null, scheduled_time: null, duration_minutes: 30, rrule: null, reminders: [] });
    await repo.toggleTaskComplete(t.id, null);
    await repo.toggleTaskComplete(t.id, null);
    expect(await db().outbox.where("[table+row_id]").equals(["tasks", t.id]).count()).toBe(1);
  });
});

describe("categories", () => {
  it("eliminar una categoria reassigna els elements", async () => {
    const a = await repo.createCategory("Uni", "#AF52DE");
    const b = await repo.createCategory("Altres", "#8E8E93");
    await repo.createEvent({ ...base, rrule: null, category_id: a.id });
    await repo.deleteCategory(a.id, b.id);
    const [occ] = await items("2026-11-02", "2026-11-02");
    expect(occ.categoryId).toBe(b.id);
    expect(occ.color).toBe("#8E8E93");
  });
});
