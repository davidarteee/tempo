"use client";
/**
 * Avisos locals mentre l'aplicació està oberta (també sense connexió).
 * Les notificacions push del servidor cobreixen el cas amb l'aplicació tancada;
 * totes dues fan servir la mateixa etiqueta (tag), de manera que el sistema no les duplica.
 */
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/data/store";
import { computeReminders } from "@/lib/notifications/reminders";
import { showLocalNotification } from "@/lib/notifications/push";
import { toast } from "../ui/feedback";

const HORIZON = 26 * 3600000;
const MAX_TIMEOUT = 2 ** 31 - 1;

export function ReminderScheduler() {
  const { dataset, ready } = useStore();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!ready) return;
    const fired = loadFired();
    const plan = () => {
      const now = Date.now();
      const due = computeReminders(dataset, new Date(now - 60000), new Date(now + HORIZON));
      const keep = new Set<string>();
      for (const r of due) {
        const k = `${r.key}@${r.fireAt.getTime()}`;
        keep.add(k);
        if (fired.has(k) || timers.current.has(k)) continue;
        const delay = Math.max(0, r.fireAt.getTime() - now);
        if (delay > MAX_TIMEOUT) continue;
        timers.current.set(
          k,
          setTimeout(async () => {
            timers.current.delete(k);
            fired.add(k);
            saveFired(fired);
            const shown = await showLocalNotification(r.title, r.body, r.key, r.url).catch(() => false);
            if (!shown || document.visibilityState === "visible") toast(`🔔 ${r.title.replace(/^☐ /, "")} — ${r.body}`, undefined, 8000);
          }, delay),
        );
      }
      // cancel·la avisos que ja no existeixen (element editat o eliminat)
      for (const [k, t] of timers.current) {
        if (!keep.has(k)) {
          clearTimeout(t);
          timers.current.delete(k);
        }
      }
    };
    plan();
    const id = setInterval(plan, 15 * 60000);
    return () => clearInterval(id);
  }, [dataset, ready]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => clearTimeout(x));
  }, []);

  return null;
}

function loadFired(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem("tempo:fired") ?? "[]") as [string, number][];
    const cutoff = Date.now() - 2 * 86400000;
    return new Set(raw.filter(([, t]) => t > cutoff).map(([k]) => k));
  } catch {
    return new Set();
  }
}

function saveFired(s: Set<string>) {
  try {
    const now = Date.now();
    localStorage.setItem("tempo:fired", JSON.stringify(Array.from(s).slice(-500).map((k) => [k, now])));
  } catch {}
}
