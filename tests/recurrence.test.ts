import { describe, expect, it } from "vitest";
import { instantToWall, wallFromParts, wallToInstant } from "@/lib/time/tz";
import { describeRule, expandWall, ruleToSpec, specToRule, splitRule, EMPTY_SPEC } from "@/lib/recurrence/rrule";
import { buildItems, dayRange, groupExceptions, type Dataset } from "@/lib/recurrence/occurrences";
import type { Category, EventException, EventRow, Task, TaskException } from "@/lib/types";
import { eventFromGoogle, ruleFromGoogle, ruleToGoogle, instanceId } from "@/lib/google/mapping";

const TZ = "Europe/Madrid";

function ds(events: EventRow[], exc: EventException[] = [], tasks: Task[] = [], texc: TaskException[] = []): Dataset {
  return {
    events,
    eventExceptions: groupExceptions(exc, (x) => x.event_id),
    tasks,
    taskExceptions: groupExceptions(texc, (x) => x.task_id),
    categories: new Map<string, Category>(),
  };
}

const meta = { user_id: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", deleted_at: null };

function ev(p: Partial<EventRow>): EventRow {
  return {
    id: "e1",
    ...meta,
    calendar_id: null,
    category_id: null,
    title: "Classe",
    description: null,
    location: null,
    all_day: false,
    start_at: null,
    end_at: null,
    start_date: null,
    end_date: null,
    timezone: TZ,
    rrule: null,
    series_parent_id: null,
    reminders: [],
    ...p,
  };
}

describe("zones horàries", () => {
  it("converteix hora de paret ↔ instant, inclosos els canvis d'hora", () => {
    const summer = wallFromParts(2026, 6, 1, 10, 0);
    expect(wallToInstant(summer, TZ).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    const winter = wallFromParts(2026, 11, 1, 10, 0);
    expect(wallToInstant(winter, TZ).toISOString()).toBe("2026-12-01T09:00:00.000Z");
    const i = new Date("2026-10-25T12:30:00Z");
    expect(wallToInstant(instantToWall(i, TZ), TZ).toISOString()).toBe(i.toISOString());
  });
});

describe("regles RRULE", () => {
  it("expandeix setmanalment i divideix la sèrie (UNTIL i COUNT)", () => {
    const start = wallFromParts(2026, 10, 2, 10); // dl 2 nov
    const occ = expandWall("FREQ=WEEKLY", start, start, wallFromParts(2026, 10, 30));
    expect(occ).toHaveLength(4); // 2, 9, 16 i 23 (el 30 a les 10:00 queda fora)
    const split = splitRule("FREQ=WEEKLY", start, wallFromParts(2026, 10, 16, 10));
    expect(expandWall(split.before!, start, start, wallFromParts(2027, 0, 1))).toHaveLength(2);
    const counted = splitRule("FREQ=DAILY;COUNT=10", start, wallFromParts(2026, 10, 5, 10));
    expect(counted.before).toContain("COUNT=3");
    expect(counted.after).toContain("COUNT=7");
  });

  it("fa anada i tornada entre especificació i regla", () => {
    const start = wallFromParts(2026, 10, 2, 10);
    const rule = specToRule({ ...EMPTY_SPEC, freq: "weekly", interval: 2, byWeekday: [0, 2], end: "count", count: 6 }, start)!;
    const spec = ruleToSpec(rule);
    expect(spec).toMatchObject({ freq: "weekly", interval: 2, byWeekday: [0, 2], end: "count", count: 6 });
    expect(describeRule(rule)).toBe("Cada 2 setmanes: dilluns, dimecres, 6 vegades");
  });
});

describe("motor d'ocurrències", () => {
  it("manté l'hora local en creuar el canvi d'horari", () => {
    const e = ev({ start_at: "2026-10-19T08:00:00Z", end_at: "2026-10-19T09:00:00Z", rrule: "FREQ=WEEKLY" }); // 10:00 CEST
    const items = buildItems(ds([e]), dayRange("2026-10-19", "2026-11-01"));
    expect(items.map((i) => i.start.getHours())).toEqual([10, 10]);
    expect(items[1].start.toISOString()).toBe("2026-10-26T09:00:00.000Z"); // 10:00 CET
  });

  it("aplica excepcions: cancel·lació i modificació", () => {
    const e = ev({ start_at: "2026-11-02T09:00:00Z", end_at: "2026-11-02T10:00:00Z", rrule: "FREQ=DAILY;COUNT=3" });
    const cancel: EventException = { id: "x1", ...meta, event_id: "e1", occurrence_key: "2026-11-03T09:00:00.000Z", cancelled: true, title: null, description: null, location: null, category_id: null, all_day: null, start_at: null, end_at: null, start_date: null, end_date: null };
    const moved: EventException = { ...cancel, id: "x2", occurrence_key: "2026-11-04T09:00:00.000Z", cancelled: false, title: "Moguda", start_at: "2026-11-04T15:00:00Z", end_at: "2026-11-04T16:00:00Z" };
    const items = buildItems(ds([e], [cancel, moved]), dayRange("2026-11-01", "2026-11-10"));
    expect(items.map((i) => i.title)).toEqual(["Classe", "Moguda"]);
    expect(items[1].start.toISOString()).toBe("2026-11-04T15:00:00.000Z");
  });

  it("separa els elements de tot el dia i els de diversos dies", () => {
    const e = ev({ all_day: true, start_date: "2026-11-09", end_date: "2026-11-11" });
    const [it] = buildItems(ds([e]), dayRange("2026-11-10", "2026-11-10"));
    expect(it.allDay).toBe(true);
    expect([it.startDay, it.endDay]).toEqual(["2026-11-09", "2026-11-11"]);
  });

  it("completa ocurrències de tasques recurrents de manera independent", () => {
    const t: Task = { id: "t1", ...meta, category_id: null, title: "Gimnàs", description: null, due_date: null, scheduled_date: "2026-11-02", scheduled_time: "18:00:00", duration_minutes: 60, timezone: TZ, rrule: "FREQ=DAILY", completed_at: null, reminders: [], sort_order: 0 };
    const done: TaskException = { id: "tx", ...meta, task_id: "t1", occurrence_key: "2026-11-03", cancelled: false, completed_at: "2026-11-03T19:00:00Z", title: null, scheduled_date: null, scheduled_time: null, clear_time: false };
    const items = buildItems(ds([], [], [t], [done]), dayRange("2026-11-02", "2026-11-04"));
    expect(items.map((i) => i.completed)).toEqual([false, true, false]);
    expect(items[0].allDay).toBe(false);
    expect(items[0].start.getHours()).toBe(18);
  });
});

describe("mapatge Google Calendar", () => {
  it("tradueix UNTIL entre hora de paret i UTC", () => {
    const g = ruleToGoogle("FREQ=WEEKLY;UNTIL=20261130T235959Z", false, TZ);
    expect(g).toBe("RRULE:FREQ=WEEKLY;UNTIL=20261130T225959Z");
    expect(ruleFromGoogle([g], false, TZ).rrule).toBe("FREQ=WEEKLY;UNTIL=20261130T235959Z");
  });

  it("converteix el final exclusiu dels dies sencers i els identificadors d'instància", () => {
    const m = eventFromGoogle({ id: "g", summary: "Viatge", start: { date: "2026-11-09" }, end: { date: "2026-11-12" } }, TZ)!;
    expect([m.fields.start_date, m.fields.end_date]).toEqual(["2026-11-09", "2026-11-11"]);
    expect(instanceId("abc", "2026-11-04T09:00:00.000Z", false)).toBe("abc_20261104T090000Z");
    expect(instanceId("abc", "2026-11-04", true)).toBe("abc_20261104");
  });
});
