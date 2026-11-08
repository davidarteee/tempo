"use client";
/**
 * Invitació a instal·lar Tempo com a aplicació.
 *  - Android / Chrome / Edge (mòbil i ordinador): botó que obre el diàleg del navegador.
 *  - iPhone / iPad (Safari): instruccions del menú Comparteix.
 * Es pot tancar; no torna a sortir fins d'aquí a 30 dies.
 */
import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/ui/install";
import { useMounted } from "@/lib/ui/hooks";
import { toast } from "../ui/feedback";
import { cn } from "@/lib/cn";

const KEY = "tempo:install-dismissed";

function dismissedRecently() {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < 30 * 86400000;
  } catch {
    return false;
  }
}

export function InstallBanner({ className }: { className?: string }) {
  const state = useInstallState();
  const mounted = useMounted();
  const [hidden, setHidden] = useState(false);
  if (!mounted || hidden || state === "installed" || state === "manual" || dismissedRecently()) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
    setHidden(true);
  };

  return (
    <div className={cn("anim-pop flex items-start gap-3 rounded-xl bg-surface p-3.5 md:border md:border-separator dark:md:border-transparent", className)}>
      <img src="/icons/icon-192.png" alt="" className="size-10 shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">Instal·la Tempo</p>
        {state === "prompt" ? (
          <p className="mt-0.5 text-[13px] leading-snug text-text-2">Obre-la des de la pantalla d&apos;inici o l&apos;escriptori, com una app més, i rep-hi els recordatoris.</p>
        ) : (
          <p className="mt-0.5 text-[13px] leading-snug text-text-2">
            Toca <Share className="inline size-[14px] align-[-2px] text-link" aria-label="Comparteix" /> i després{" "}
            <span className="whitespace-nowrap font-medium text-text">
              <SquarePlus className="inline size-[14px] align-[-2px]" /> Afegeix a la pantalla d&apos;inici
            </span>
            .
          </p>
        )}
        {state === "prompt" && (
          <button
            type="button"
            onClick={async () => {
              if (await promptInstall()) toast("Tempo s'ha instal·lat");
            }}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-white"
          >
            <Download className="size-4" /> Instal·la
          </button>
        )}
      </div>
      <button type="button" onClick={close} aria-label="Tanca" className="-mt-1 -mr-1 rounded-full p-1.5 text-text-3 hover:bg-fill hover:text-text">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Botó compacte per a la barra lateral (ordinador) */
export function InstallSidebarButton() {
  const state = useInstallState();
  const mounted = useMounted();
  if (!mounted || state !== "prompt") return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (await promptInstall()) toast("Tempo s'ha instal·lat");
      }}
      className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-text-2 transition-colors hover:bg-fill/60 hover:text-text"
    >
      <Download className="size-[18px]" />
      Instal·la l&apos;app
    </button>
  );
}
