"use client";
import { useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, AlertTriangle, Check, HardDrive } from "lucide-react";
import { getSyncStatus, subscribeSyncStatus, syncNow } from "@/lib/sync/engine";
import { cn } from "@/lib/cn";

export function useSyncStatus() {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

/** Indicador discret de l'estat de connexió i sincronització */
export function SyncIndicator({ compact }: { compact?: boolean }) {
  const s = useSyncStatus();
  let icon = <Check className="size-3.5" />;
  let label = "Sincronitzat";
  let tone = "text-text-3";
  if (s.state === "local") {
    icon = <HardDrive className="size-3.5" />;
    label = "Només en aquest dispositiu";
  } else if (s.state === "offline") {
    icon = <CloudOff className="size-3.5" />;
    label = s.pending ? `Sense connexió · ${s.pending} canvis pendents` : "Sense connexió";
    tone = "text-text-2";
  } else if (s.state === "syncing") {
    icon = <RefreshCw className="size-3.5 animate-spin" />;
    label = "Sincronitzant…";
  } else if (s.state === "error") {
    icon = <AlertTriangle className="size-3.5" />;
    label = s.failed ? `${s.failed} canvis no desats` : "Error de sincronització";
    tone = "text-danger";
  } else if (s.pending) {
    icon = <RefreshCw className="size-3.5" />;
    label = `${s.pending} canvis pendents`;
  }
  if (compact && (s.state === "local" || ((s.state === "idle" || s.state === "syncing") && !s.pending))) return null;
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={s.error ?? label}
      aria-label={label}
      className={cn("flex items-center gap-1.5 rounded-full text-[12px] transition-colors hover:text-text", tone, compact && "bg-surface/90 px-2.5 py-1 shadow-sm backdrop-blur")}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
