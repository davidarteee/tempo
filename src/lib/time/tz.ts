/**
 * Utilitats de zona horària sense dependències (Intl).
 *
 * Model: les hores "de paret" (wall time) es representen com a Date "flotants",
 * on els camps UTC contenen l'hora local d'una zona concreta. Això permet
 * expandir recurrències (rrule) de manera estable davant canvis d'horari d'estiu
 * i és idèntic al client i al servidor.
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Instant real → hora de paret (Date flotant) a la zona `tz`. */
export function instantToWall(instant: Date, tz: string): Date {
  const parts = formatter(tz).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")),
  );
}

/** Hora de paret (Date flotant) a la zona `tz` → instant real. */
export function wallToInstant(wall: Date, tz: string): Date {
  // Aproximació iterativa: dues passades resolen correctament els canvis d'hora.
  const target = wall.getTime();
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const offset = instantToWall(new Date(guess), tz).getTime() - guess;
    const next = target - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

export function wallFromParts(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min));
}

/** 'YYYY-MM-DD' d'un Date flotant */
export function wallDateKey(wall: Date): string {
  return wall.toISOString().slice(0, 10);
}
