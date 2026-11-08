"use client";
/**
 * Finestra modal adaptable: full inferior al mòbil (es pot tancar arrossegant cap avall)
 * i diàleg centrat a l'ordinador. Gestiona Esc, bloqueig del desplaçament i focus.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function Sheet({
  open,
  onClose,
  children,
  label,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
      el?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
    panel.current.style.transition = "none";
  };
  const onHandleUp = () => {
    if (!drag.current || !panel.current) return;
    const dy = drag.current.dy;
    drag.current = null;
    panel.current.style.transition = "transform 260ms var(--ease-spring)";
    if (dy > 110) {
      panel.current.style.transform = "translateY(100%)";
      setClosing(true);
      setTimeout(() => {
        setClosing(false);
        onClose();
      }, 220);
    } else panel.current.style.transform = "";
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className={cn("anim-fade absolute inset-0 bg-[var(--overlay)]", closing && "opacity-0 transition-opacity")} onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "anim-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[14px] bg-grouped shadow-pop outline-none sm:max-h-[86vh] sm:rounded-[14px] dark:bg-surface-2",
          size === "sm" && "sm:max-w-[380px]",
          size === "md" && "sm:max-w-[480px]",
          size === "lg" && "sm:max-w-[640px]",
          className,
        )}
      >
        <div
          className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center sm:hidden"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          aria-hidden
        >
          <span className="h-[5px] w-9 rounded-full bg-fill-strong" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Capçalera estil iOS: Cancel·la · Títol · Acció */
export function SheetHeader({ title, onCancel, onDone, doneLabel = "Fet", doneDisabled, cancelLabel = "Cancel·la" }: { title: ReactNode; onCancel?: () => void; onDone?: () => void; doneLabel?: string; doneDisabled?: boolean; cancelLabel?: string }) {
  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pb-2 sm:pt-3">
      <div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-[16px] text-accent hover:bg-fill sm:text-[15px]">
            {cancelLabel}
          </button>
        )}
      </div>
      <h2 className="truncate text-center text-[16px] font-semibold sm:text-[15px]">{title}</h2>
      <div className="flex justify-end">
        {onDone && (
          <button type="button" disabled={doneDisabled} onClick={onDone} className="rounded-lg px-2 py-1 text-[16px] font-semibold text-accent hover:bg-fill disabled:opacity-35 sm:text-[15px]">
            {doneLabel}
          </button>
        )}
      </div>
    </div>
  );
}
