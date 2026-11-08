"use client";
import { Moon, Sun } from "lucide-react";
import { setPrefs, useUI } from "@/lib/ui/state";
import { useMediaQuery } from "@/lib/ui/hooks";
import { cn } from "@/lib/cn";

/** Canvi ràpid entre mode clar i fosc (l'opció "Automàtic" és a Ajustos → Aparença) */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const pref = useUI((s) => s.prefs.theme);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const dark = pref === "dark" || (pref === "system" && systemDark);
  const label = dark ? "Canvia a mode clar" : "Canvia a mode fosc";
  return (
    <button
      type="button"
      onClick={() => setPrefs({ theme: dark ? "light" : "dark" })}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-text-2 transition-colors hover:bg-fill hover:text-text active:bg-fill-strong",
        withLabel ? "h-9 px-3 text-[13px] font-medium" : "size-9",
        className,
      )}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      {withLabel && <span>{dark ? "Mode clar" : "Mode fosc"}</span>}
    </button>
  );
}
