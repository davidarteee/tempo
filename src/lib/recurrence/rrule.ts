/**
 * Recurrència basada en RFC 5545 (RRULE) amb rrule.js.
 *
 * Les regles es guarden SENSE DTSTART (l'inici és el de l'element). Tots els càlculs
 * es fan en "hora de paret flotant" (vegeu time/tz.ts). Un UNTIL desat s'interpreta
 * també com a hora de paret de la zona de l'element.
 */
import { RRule, Frequency, Weekday, type Options } from "rrule";

export type Freq = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type EndMode = "never" | "until" | "count";

export interface RecurrenceSpec {
  freq: Freq;
  interval: number;
  byWeekday: number[]; // 0 = dilluns … 6 = diumenge (convenció rrule)
  monthlyMode: "monthday" | "weekday";
  end: EndMode;
  until: string | null; // YYYY-MM-DD (inclusiu)
  count: number | null;
}

const FREQ_MAP: Record<Exclude<Freq, "none">, Frequency> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

export const EMPTY_SPEC: RecurrenceSpec = {
  freq: "none",
  interval: 1,
  byWeekday: [],
  monthlyMode: "monthday",
  end: "never",
  until: null,
  count: null,
};

/** JS getDay() (0 = diumenge) → rrule weekday (0 = dilluns) */
export function jsDayToRRule(jsDay: number) {
  return (jsDay + 6) % 7;
}

function cleanRule(rule: string): string {
  return rule.replace(/^RRULE:/i, "").trim();
}

export function parseRule(rule: string): Partial<Options> {
  return RRule.parseString(cleanRule(rule));
}

export function buildRule(rule: string, dtstartWall: Date): RRule {
  const opts = parseRule(rule);
  return new RRule({ ...opts, dtstart: dtstartWall, tzid: undefined });
}

/** Ocurrències (hores de paret flotants) que comencen dins [from, to]. */
export function expandWall(rule: string, dtstartWall: Date, fromWall: Date, toWall: Date, limit = 2000): Date[] {
  try {
    const r = buildRule(rule, dtstartWall);
    const out: Date[] = [];
    r.between(fromWall, toWall, true, (d) => {
      out.push(d);
      return out.length < limit;
    });
    return out;
  } catch {
    return [dtstartWall];
  }
}

export function isFirstOccurrence(rule: string, dtstartWall: Date, occWall: Date): boolean {
  try {
    const first = buildRule(rule, dtstartWall).after(new Date(dtstartWall.getTime() - 1), true);
    return !first || first.getTime() === occWall.getTime();
  } catch {
    return true;
  }
}

function untilStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function stringify(opts: Partial<Options>): string {
  const clean: Partial<Options> = { ...opts };
  delete clean.dtstart;
  delete clean.tzid;
  return RRule.optionsToString(clean).replace(/^RRULE:/, "");
}

/**
 * Divideix una sèrie a l'ocurrència `splitWall`.
 * Retorna la regla de la sèrie original (acaba just abans) i la de la nova sèrie.
 * Si la regla tenia COUNT, es reparteix el recompte.
 */
export function splitRule(rule: string, dtstartWall: Date, splitWall: Date): { before: string | null; after: string } {
  const opts = parseRule(rule);
  const r = buildRule(rule, dtstartWall);
  const before = { ...opts };
  const after = { ...opts };
  if (opts.count) {
    const already = r.between(new Date(dtstartWall.getTime() - 1), new Date(splitWall.getTime() - 1), true).length;
    if (already <= 0) return { before: null, after: rule };
    before.count = already;
    after.count = Math.max(1, opts.count - already);
  } else {
    delete before.count;
    before.until = new Date(splitWall.getTime() - 1000);
  }
  return { before: stringify(before), after: stringify(after) };
}

/** Acaba la sèrie just abans de `wall`. Retorna null si no quedaria cap ocurrència. */
export function endRuleBefore(rule: string, dtstartWall: Date, wall: Date): string | null {
  return splitRule(rule, dtstartWall, wall).before;
}

export function specToRule(spec: RecurrenceSpec, startWall: Date): string | null {
  if (spec.freq === "none") return null;
  const opts: Partial<Options> = {
    freq: FREQ_MAP[spec.freq],
    interval: Math.max(1, spec.interval || 1),
  };
  if (spec.freq === "weekly" && spec.byWeekday.length) {
    opts.byweekday = [...spec.byWeekday].sort().map((d) => new Weekday(d));
  }
  if (spec.freq === "monthly" && spec.monthlyMode === "weekday") {
    const nth = Math.ceil(startWall.getUTCDate() / 7);
    const wd = jsDayToRRule(startWall.getUTCDay());
    opts.byweekday = [new Weekday(wd, nth > 4 ? -1 : nth)];
  }
  if (spec.end === "count" && spec.count) opts.count = Math.max(1, spec.count);
  if (spec.end === "until" && spec.until) {
    const [y, m, d] = spec.until.split("-").map(Number);
    opts.until = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  }
  return stringify(opts);
}

export function ruleToSpec(rule: string | null): RecurrenceSpec {
  if (!rule) return { ...EMPTY_SPEC };
  try {
    const o = parseRule(rule);
    const freq: Freq =
      o.freq === RRule.DAILY ? "daily" : o.freq === RRule.WEEKLY ? "weekly" : o.freq === RRule.MONTHLY ? "monthly" : o.freq === RRule.YEARLY ? "yearly" : "none";
    const wds = (Array.isArray(o.byweekday) ? o.byweekday : o.byweekday != null ? [o.byweekday] : []) as (Weekday | number)[];
    const monthlyWeekday = freq === "monthly" && wds.some((w) => typeof w !== "number" && w.n);
    return {
      freq,
      interval: o.interval || 1,
      byWeekday: freq === "weekly" ? wds.map((w) => (typeof w === "number" ? w : w.weekday)) : [],
      monthlyMode: monthlyWeekday ? "weekday" : "monthday",
      end: o.count ? "count" : o.until ? "until" : "never",
      until: o.until ? o.until.toISOString().slice(0, 10) : null,
      count: o.count ?? null,
    };
  } catch {
    return { ...EMPTY_SPEC };
  }
}

/** Indica si la regla és un preset simple o personalitzada */
export function isSimpleSpec(spec: RecurrenceSpec): boolean {
  return spec.interval === 1 && spec.end === "never" && spec.byWeekday.length <= 1 && spec.monthlyMode === "monthday";
}

const DAY_NAMES = ["dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"];
const ORD = ["", "primer", "segon", "tercer", "quart"];

export function describeRule(rule: string | null, startWall?: Date): string {
  if (!rule) return "Mai";
  const s = ruleToSpec(rule);
  const n = s.interval;
  let base = "";
  switch (s.freq) {
    case "daily":
      base = n === 1 ? "Cada dia" : `Cada ${n} dies`;
      break;
    case "weekly": {
      base = n === 1 ? "Cada setmana" : `Cada ${n} setmanes`;
      if (s.byWeekday.length) {
        const sorted = [...s.byWeekday].sort();
        if (sorted.join() === "0,1,2,3,4") base = n === 1 ? "Cada dia feiner" : `${base}, de dilluns a divendres`;
        else base += `: ${sorted.map((d) => DAY_NAMES[d]).join(", ")}`;
      }
      break;
    }
    case "monthly":
      base = n === 1 ? "Cada mes" : `Cada ${n} mesos`;
      if (s.monthlyMode === "weekday" && startWall) {
        const nth = Math.ceil(startWall.getUTCDate() / 7);
        base += `, el ${nth > 4 ? "darrer" : ORD[nth]} ${DAY_NAMES[jsDayToRRule(startWall.getUTCDay())]}`;
      }
      break;
    case "yearly":
      base = n === 1 ? "Cada any" : `Cada ${n} anys`;
      break;
    default:
      return "Mai";
  }
  if (s.end === "count") base += `, ${s.count} ${s.count === 1 ? "vegada" : "vegades"}`;
  if (s.end === "until" && s.until) {
    const [y, m, d] = s.until.split("-");
    base += `, fins al ${Number(d)}/${Number(m)}/${y}`;
  }
  return base;
}

export { untilStamp };
