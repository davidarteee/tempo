"use client";
/**
 * Avisos (toast) i diàlegs basats en promeses: abast de sèries recurrents i confirmacions.
 */
import { useSyncExternalStore } from "react";
import { useMounted } from "@/lib/ui/hooks";
import { createPortal } from "react-dom";
import type { EditScope } from "@/lib/types";
import { Sheet } from "./Sheet";
import { cn } from "@/lib/cn";

// ───────────────────────── Toast ─────────────────────────

interface ToastData {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

let toasts: ToastData[] = [];
const toastListeners = new Set<() => void>();
let seq = 0;

export function toast(message: string, action?: ToastData["action"], ms = 4500) {
  const t = { id: ++seq, message, action };
  toasts = [...toasts.slice(-2), t];
  toastListeners.forEach((l) => l());
  setTimeout(() => dismiss(t.id), ms);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  toastListeners.forEach((l) => l());
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 md:bottom-6">
      {list.map((t) => (
        <div key={t.id} className="anim-toast pointer-events-auto flex items-center gap-3 rounded-xl bg-[#2c2c2e] px-4 py-3 text-[14px] text-white shadow-pop dark:bg-[#3a3a3c]">
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold text-[#ff8a80]"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ───────────────────────── Diàlegs ─────────────────────────

type DialogReq =
  | { type: "scope"; action: "edit" | "delete"; kind: "event" | "task"; allowThis: boolean; resolve: (s: EditScope | null) => void }
  | { type: "confirm"; title: string; message?: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void };

let current: DialogReq | null = null;
const dialogListeners = new Set<() => void>();
function setDialog(d: DialogReq | null) {
  current = d;
  dialogListeners.forEach((l) => l());
}

/** Pregunta l'abast d'un canvi en una sèrie recurrent */
export function askScope(action: "edit" | "delete", kind: "event" | "task", allowThis = true): Promise<EditScope | null> {
  return new Promise((resolve) => setDialog({ type: "scope", action, kind, allowThis, resolve }));
}

export function confirmDialog(title: string, opts: { message?: string; confirmLabel?: string; destructive?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) =>
    setDialog({ type: "confirm", title, message: opts.message, confirmLabel: opts.confirmLabel ?? "D'acord", destructive: opts.destructive ?? false, resolve }),
  );
}

export function DialogHost() {
  const d = useSyncExternalStore(
    (cb) => {
      dialogListeners.add(cb);
      return () => dialogListeners.delete(cb);
    },
    () => current,
    () => null,
  );
  const mounted = useMounted();
  if (!mounted || !d) return null;

  const close = (v: EditScope | boolean | null) => {
    setDialog(null);
    if (d.type === "scope") d.resolve(v as EditScope | null);
    else d.resolve(Boolean(v));
  };

  if (d.type === "confirm") {
    return (
      <Sheet open label={d.title} size="sm" onClose={() => close(false)}>
        <div className="px-5 pt-3 pb-2 text-center sm:pt-5">
          <h2 className="text-[17px] font-semibold">{d.title}</h2>
          {d.message && <p className="mt-1.5 text-[14px] leading-snug text-text-2">{d.message}</p>}
        </div>
        <div className="flex flex-col gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:flex-row-reverse sm:pb-4 sm:[&>button]:flex-1">
          <ActionButton destructive={d.destructive} strong onClick={() => close(true)} autoFocus>
            {d.confirmLabel}
          </ActionButton>
          <ActionButton onClick={() => close(false)}>Cancel·la</ActionButton>
        </div>
      </Sheet>
    );
  }

  const noun = d.kind === "event" ? "esdeveniment" : "tasca";
  const title = d.action === "edit" ? `Aquest ${noun === "tasca" ? "element" : noun} es repeteix` : `Eliminar ${d.kind === "event" ? "l'esdeveniment" : "la tasca"} recurrent`;
  const message = d.action === "edit" ? "Vols aplicar els canvis només a aquesta ocurrència o també a les altres?" : "Quines ocurrències vols eliminar?";
  return (
    <Sheet open label={title} size="sm" onClose={() => close(null)}>
      <div className="px-5 pt-3 pb-1 text-center sm:pt-5">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-text-2">{message}</p>
      </div>
      <div className="flex flex-col gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:pb-4">
        {d.allowThis && (
          <ActionButton destructive={d.action === "delete"} onClick={() => close("this")} autoFocus>
            Només aquesta ocurrència
          </ActionButton>
        )}
        <ActionButton destructive={d.action === "delete"} onClick={() => close("future")}>
          Aquesta i les futures
        </ActionButton>
        <ActionButton destructive={d.action === "delete"} onClick={() => close("all")}>
          Totes les ocurrències
        </ActionButton>
        <ActionButton strong onClick={() => close(null)}>
          Cancel·la
        </ActionButton>
      </div>
    </Sheet>
  );
}

function ActionButton({ children, onClick, destructive, strong, autoFocus }: { children: React.ReactNode; onClick: () => void; destructive?: boolean; strong?: boolean; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-autofocus={autoFocus ? "" : undefined}
      className={cn(
        "h-11 w-full shrink-0 rounded-xl bg-surface text-[16px] transition-colors hover:bg-surface-3 active:bg-fill-strong sm:h-10 sm:text-[15px] dark:bg-surface-3 dark:hover:bg-fill-strong",
        destructive ? "text-danger" : "text-accent",
        strong && "font-semibold",
      )}
    >
      {children}
    </button>
  );
}
