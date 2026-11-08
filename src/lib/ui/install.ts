"use client";
/**
 * Instal·lació com a aplicació (PWA).
 * L'esdeveniment `beforeinstallprompt` arriba només una vegada i molt aviat, per això
 * es captura a nivell de mòdul (abans que es munti cap pantalla) i s'exposa com a store.
 */
import { useSyncExternalStore } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallState =
  | "installed" // ja s'executa com a app
  | "prompt" // el navegador permet instal·lar amb un botó
  | "ios" // Safari d'iPhone/iPad: cal fer-ho des del menú Comparteix
  | "manual"; // altres navegadors: opció del menú

function snapshot(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}

let cached: InstallState = "manual";
function getState(): InstallState {
  const next = snapshot();
  if (next !== cached) cached = next;
  return cached;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getState,
    () => "manual",
  );
}

/** Obre el diàleg d'instal·lació del navegador. Retorna true si s'ha instal·lat. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}
