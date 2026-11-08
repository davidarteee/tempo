"use client";
import { useState } from "react";
import { Bell, Plus, Repeat, Tag, X } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { describeRule, EMPTY_SPEC, jsDayToRRule, ruleToSpec, specToRule, type RecurrenceSpec } from "@/lib/recurrence/rrule";
import { ColorDot, NativeSelect, PillInput, Row, Segmented } from "../ui/primitives";
import { cn } from "@/lib/cn";

// ───────────────────────── Categoria ─────────────────────────

export function CategoryRow({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { categories } = useStore();
  const current = categories.find((c) => c.id === value);
  return (
    <Row label="Categoria" icon={<Tag className="size-[18px]" />}>
      {current && <ColorDot color={current.color} />}
      <NativeSelect label="Categoria" value={value ?? ""} onChange={(v) => onChange(v || null)}>
        <option value="">Cap</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
    </Row>
  );
}

// ───────────────────────── Recurrència ─────────────────────────

type Preset = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";

function presetOf(rule: string | null, startWall: Date): Preset {
  if (!rule) return "none";
  const s = ruleToSpec(rule);
  const wd = jsDayToRRule(startWall.getUTCDay());
  if (s.end !== "never") return "custom";
  if (s.freq === "daily" && s.interval === 1) return "daily";
  if (s.freq === "weekly" && s.byWeekday.slice().sort().join() === "0,1,2,3,4" && s.interval === 1) return "weekdays";
  if (s.freq === "weekly" && (s.byWeekday.length === 0 || (s.byWeekday.length === 1 && s.byWeekday[0] === wd))) return s.interval === 1 ? "weekly" : s.interval === 2 ? "biweekly" : "custom";
  if (s.freq === "monthly" && s.interval === 1 && s.monthlyMode === "monthday") return "monthly";
  if (s.freq === "yearly" && s.interval === 1) return "yearly";
  return "custom";
}

function presetRule(p: Preset, startWall: Date): string | null {
  const base = { ...EMPTY_SPEC };
  switch (p) {
    case "none":
      return null;
    case "daily":
      return specToRule({ ...base, freq: "daily" }, startWall);
    case "weekdays":
      return specToRule({ ...base, freq: "weekly", byWeekday: [0, 1, 2, 3, 4] }, startWall);
    case "weekly":
      return specToRule({ ...base, freq: "weekly" }, startWall);
    case "biweekly":
      return specToRule({ ...base, freq: "weekly", interval: 2 }, startWall);
    case "monthly":
      return specToRule({ ...base, freq: "monthly" }, startWall);
    case "yearly":
      return specToRule({ ...base, freq: "yearly" }, startWall);
    default:
      return null;
  }
}

const WD = ["dl", "dt", "dc", "dj", "dv", "ds", "dg"];

/** `startWall`: Date flotant (camps UTC = data local d'inici) */
export function RecurrenceRows({ value, onChange, startWall, disabled }: { value: string | null; onChange: (r: string | null) => void; startWall: Date; disabled?: boolean }) {
  const preset = presetOf(value, startWall);
  const [custom, setCustom] = useState(preset === "custom");
  const spec: RecurrenceSpec = value ? ruleToSpec(value) : { ...EMPTY_SPEC, freq: "weekly", byWeekday: [jsDayToRRule(startWall.getUTCDay())] };
  const update = (patch: Partial<RecurrenceSpec>) => onChange(specToRule({ ...spec, ...patch }, startWall));

  return (
    <>
      <Row label="Repetició" icon={<Repeat className="size-[18px]" />}>
        <NativeSelect
          label="Repetició"
          value={custom ? "custom" : preset}
          onChange={(v) => {
            const p = v as Preset;
            if (p === "custom") {
              setCustom(true);
              if (!value) onChange(specToRule(spec, startWall));
            } else {
              setCustom(false);
              onChange(presetRule(p, startWall));
            }
          }}
        >
          <option value="none">Mai</option>
          <option value="daily">Cada dia</option>
          <option value="weekdays">Cada dia feiner</option>
          <option value="weekly">Cada setmana</option>
          <option value="biweekly">Cada 2 setmanes</option>
          <option value="monthly">Cada mes</option>
          <option value="yearly">Cada any</option>
          <option value="custom">Personalitzada…</option>
        </NativeSelect>
      </Row>
      {disabled && value && <p className="px-4 py-2 text-[12px] text-text-3">Per canviar la regla, desa els canvis a «Aquesta i les futures» o «Totes».</p>}
      {custom && value && (
        <div className="space-y-3 px-4 py-3 text-[14px]">
          <div className="flex items-center gap-2">
            <span className="text-text-2">Cada</span>
            <PillInput type="number" min={1} max={99} value={spec.interval} onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })} className="w-16 text-center" aria-label="Interval" />
            <select
              aria-label="Freqüència"
              value={spec.freq}
              onChange={(e) => update({ freq: e.target.value as RecurrenceSpec["freq"], byWeekday: e.target.value === "weekly" ? [jsDayToRRule(startWall.getUTCDay())] : [] })}
              className="h-8 rounded-lg bg-fill px-2 outline-none"
            >
              <option value="daily">{spec.interval === 1 ? "dia" : "dies"}</option>
              <option value="weekly">{spec.interval === 1 ? "setmana" : "setmanes"}</option>
              <option value="monthly">{spec.interval === 1 ? "mes" : "mesos"}</option>
              <option value="yearly">{spec.interval === 1 ? "any" : "anys"}</option>
            </select>
          </div>
          {spec.freq === "weekly" && (
            <div className="flex gap-1" role="group" aria-label="Dies de la setmana">
              {WD.map((l, i) => {
                const on = spec.byWeekday.includes(i);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? spec.byWeekday.filter((d) => d !== i) : [...spec.byWeekday, i];
                      update({ byWeekday: next.length ? next : [i] });
                    }}
                    className={cn("h-8 flex-1 rounded-lg text-[13px] font-medium transition-colors", on ? "bg-accent text-white" : "bg-fill text-text-2 hover:bg-fill-strong")}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          )}
          {spec.freq === "monthly" && (
            <Segmented
              className="w-full"
              value={spec.monthlyMode}
              onChange={(m) => update({ monthlyMode: m })}
              options={[
                { value: "monthday", label: `El dia ${startWall.getUTCDate()}` },
                { value: "weekday", label: "El mateix dia de la setmana" },
              ]}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-2">Acaba</span>
            <select aria-label="Final de la repetició" value={spec.end} onChange={(e) => update({ end: e.target.value as RecurrenceSpec["end"], count: spec.count ?? 10, until: spec.until ?? addMonthsKey(startWall, 3) })} className="h-8 rounded-lg bg-fill px-2 outline-none">
              <option value="never">mai</option>
              <option value="until">el dia</option>
              <option value="count">després de</option>
            </select>
            {spec.end === "until" && <PillInput type="date" value={spec.until ?? ""} onChange={(e) => e.target.value && update({ until: e.target.value })} aria-label="Data final" />}
            {spec.end === "count" && (
              <>
                <PillInput type="number" min={1} max={999} value={spec.count ?? 10} onChange={(e) => update({ count: Math.max(1, Number(e.target.value) || 1) })} className="w-16 text-center" aria-label="Nombre de repeticions" />
                <span className="text-text-2">vegades</span>
              </>
            )}
          </div>
          <p className="text-[12px] text-text-3">{describeRule(value, startWall)}</p>
        </div>
      )}
    </>
  );
}

function addMonthsKey(w: Date, n: number) {
  const d = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + n, w.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

// ───────────────────────── Recordatoris ─────────────────────────

const TIMED_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
const ALLDAY_OPTIONS = [0, 1440, 2880, 10080];

export function reminderLabel(min: number, allDay: boolean): string {
  if (allDay) {
    // relatiu a les 09:00 del dia
    if (min === 0) return "El mateix dia (09:00)";
    if (min % 1440 === 0) return `${min / 1440} ${min === 1440 ? "dia" : "dies"} abans (09:00)`;
    return `${fmtOffset(min)} abans de les 09:00`;
  }
  if (min === 0) return "A l'hora de l'inici";
  return `${fmtOffset(min)} abans`;
}

function fmtOffset(min: number) {
  if (min % 10080 === 0) return `${min / 10080} ${min === 10080 ? "setmana" : "setmanes"}`;
  if (min % 1440 === 0) return `${min / 1440} ${min === 1440 ? "dia" : "dies"}`;
  if (min % 60 === 0) return `${min / 60} ${min === 60 ? "hora" : "hores"}`;
  return `${min} min`;
}

export function RemindersRows({ value, onChange, allDay, disabledReason }: { value: number[]; onChange: (v: number[]) => void; allDay: boolean; disabledReason?: string }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [n, setN] = useState(20);
  const [unit, setUnit] = useState<1 | 60 | 1440>(1);
  const options = (allDay ? ALLDAY_OPTIONS : TIMED_OPTIONS).filter((o) => !value.includes(o));
  if (disabledReason) {
    return (
      <Row label="Recordatoris" icon={<Bell className="size-[18px]" />}>
        <span className="text-[13px] text-text-3">{disabledReason}</span>
      </Row>
    );
  }
  return (
    <>
      {value.map((m) => (
        <Row key={m} label={reminderLabel(m, allDay)} icon={<Bell className="size-[18px]" />}>
          <button type="button" aria-label="Elimina el recordatori" onClick={() => onChange(value.filter((x) => x !== m))} className="rounded-full p-1 text-text-3 hover:bg-fill hover:text-text">
            <X className="size-4" />
          </button>
        </Row>
      ))}
      <Row label={value.length ? "Afegeix un recordatori" : "Recordatori"} icon={value.length ? <Plus className="size-[18px]" /> : <Bell className="size-[18px]" />}>
        <NativeSelect
          label="Afegeix un recordatori"
          value=""
          onChange={(v) => {
            if (v === "custom") setCustomOpen(true);
            else if (v !== "") onChange([...value, Number(v)].sort((a, b) => a - b));
          }}
        >
          <option value="">{value.length ? "Afegeix…" : "Cap"}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {reminderLabel(o, allDay)}
            </option>
          ))}
          <option value="custom">Personalitzat…</option>
        </NativeSelect>
      </Row>
      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[14px]">
          <PillInput type="number" min={1} max={999} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} className="w-16 text-center" aria-label="Quantitat" />
          <select aria-label="Unitat" value={unit} onChange={(e) => setUnit(Number(e.target.value) as 1 | 60 | 1440)} className="h-8 rounded-lg bg-fill px-2 outline-none">
            <option value={1}>minuts</option>
            <option value={60}>hores</option>
            <option value={1440}>dies</option>
          </select>
          <span className="text-text-2">abans</span>
          <button
            type="button"
            className="ml-auto rounded-lg bg-accent px-3 py-1 text-[13px] font-semibold text-white"
            onClick={() => {
              const m = Math.min(n * unit, 60 * 24 * 28);
              if (!value.includes(m)) onChange([...value, m].sort((a, b) => a - b));
              setCustomOpen(false);
            }}
          >
            Afegeix
          </button>
        </div>
      )}
    </>
  );
}
