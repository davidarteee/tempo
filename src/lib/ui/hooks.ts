"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

export function useMediaQuery(q: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
    () => fallback,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 768px)", true);

/** Data actual que s'actualitza cada minut (i en tornar a la pestanya) */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [intervalMs]);
  return now;
}

/** Clau del dia d'avui, reactiva a mitjanit */
export function useTodayKey(): string {
  const now = useNow(60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const noop = () => () => {};
/** true al client després de la hidratació */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
