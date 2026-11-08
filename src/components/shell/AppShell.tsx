"use client";
import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckCircle2, Settings, Sun, Plus, CalendarPlus, ListPlus } from "lucide-react";
import { AuthGate, useAuth } from "./AuthGate";
import { DataProvider, useStore } from "@/lib/data/store";
import { closeEditor, hydrateUI, openEditor, setDate, setQuickCreate, useUI, applyTheme, getUI } from "@/lib/ui/state";
import { EventEditor } from "../editors/EventEditor";
import { TaskEditor } from "../editors/TaskEditor";
import { DialogHost, Toaster } from "../ui/feedback";
import { ScheduleHost } from "../tasks/ScheduleSheet";
import { Sheet } from "../ui/Sheet";
import { SyncIndicator } from "./SyncIndicator";
import { MiniMonth } from "../calendar/MiniMonth";
import { taskViews } from "@/lib/data/tasks";
import { TaskRow } from "../tasks/TaskRow";
import { useTodayKey } from "@/lib/ui/hooks";
import { cn } from "@/lib/cn";
import { ReminderScheduler } from "./ReminderScheduler";
import { GoogleAutoSync } from "./GoogleAutoSync";
import { ThemeToggle } from "./ThemeToggle";
import { InstallSidebarButton } from "./InstallBanner";

const NAV = [
  { href: "/today", label: "Avui", icon: Sun },
  { href: "/calendar", label: "Calendari", icon: CalendarDays },
  { href: "/tasks", label: "Tasques", icon: CheckCircle2 },
  { href: "/settings", label: "Ajustos", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    hydrateUI();
    applyTheme(getUI().prefs.theme);
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme(getUI().prefs.theme);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return (
    <AuthGate>
      <Inner>{children}</Inner>
    </AuthGate>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  return (
    <DataProvider key={userId} userId={userId}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+8px)] left-1/2 z-40 -translate-x-1/2 md:hidden">
            <div className="pointer-events-auto">
              <SyncIndicator compact />
            </div>
          </div>
          <div className="min-h-0 flex-1">{children}</div>
          <TabBar />
        </main>
      </div>
      <EditorHost />
      <QuickCreate />
      <ScheduleHost />
      <DialogHost />
      <Toaster />
      <GlobalShortcuts />
      <ReminderScheduler />
      <GoogleAutoSync />
    </DataProvider>
  );
}

function Sidebar() {
  const path = usePathname();
  const date = useUI((s) => s.date);
  const view = useUI((s) => s.view);
  const onCalendar = path.startsWith("/calendar");
  const { dataset, subtasksByTask } = useStore();
  const today = useTodayKey();
  const views = useMemo(() => taskViews(dataset, subtasksByTask, today), [dataset, subtasksByTask, today]);
  const inbox = views.filter((v) => !v.completed && !v.date && !v.overdue).sort((a, b) => a.task.sort_order - b.task.sort_order);
  const todayCount = views.filter((v) => !v.completed && (v.date === today || v.overdue)).length;

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-separator bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 pr-3 pl-5">
        <Logo />
        <span className="flex-1 text-[17px] font-semibold tracking-tight">Tempo</span>
        <ThemeToggle />
      </div>
      <nav className="space-y-0.5 px-3" aria-label="Seccions">
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn("flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors", active ? "bg-fill text-text" : "text-text-2 hover:bg-fill/60 hover:text-text")}
            >
              <n.icon className={cn("size-[18px]", active && "text-accent")} />
              <span className="flex-1">{n.label}</span>
              {n.href === "/today" && todayCount > 0 && <span className="tabular text-[12px] text-text-3">{todayCount}</span>}
              {n.href === "/tasks" && inbox.length > 0 && <span className="tabular text-[12px] text-text-3">{inbox.length}</span>}
            </Link>
          );
        })}
      </nav>

      {onCalendar && (
        <div className="scroll-thin mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
          <div className="px-1">
            <MiniMonth value={date} onSelect={setDate} highlightWeek={view === "week"} />
          </div>
          <div className="mt-6 mb-1 flex items-baseline justify-between px-2">
            <h2 className="text-[12px] font-semibold tracking-wide text-text-3 uppercase">Per programar</h2>
            <span className="tabular text-[12px] text-text-3">{inbox.length}</span>
          </div>
          {inbox.length ? (
            <>
              <p className="mb-1 px-2 text-[11.5px] leading-snug text-text-3">Arrossega una tasca a un dia o a una hora del calendari.</p>
              <div className="-mx-1 overflow-hidden rounded-lg">
                {inbox.map((v) => (
                  <TaskRow key={v.task.id} v={v} />
                ))}
              </div>
            </>
          ) : (
            <p className="px-2 text-[12px] text-text-3">Totes les tasques tenen data.</p>
          )}
        </div>
      )}
      {!onCalendar && <div className="flex-1" />}
      <div className="px-3 pb-1">
        <InstallSidebarButton />
      </div>
      <div className="border-t border-separator px-5 py-3">
        <SyncIndicator />
      </div>
    </aside>
  );
}

function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Seccions" className="pb-safe relative z-30 shrink-0 border-t border-separator bg-bg/90 backdrop-blur-xl md:hidden">
      <div className="grid h-[54px] grid-cols-4">
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium", active ? "text-accent" : "text-text-3")} aria-current={active ? "page" : undefined}>
              <n.icon className="size-[23px]" strokeWidth={active ? 2.2 : 1.8} />
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function EditorHost() {
  const editor = useUI((s) => s.editor);
  if (!editor) return null;
  if (editor.type === "event") {
    return editor.mode === "create" ? <EventEditor key="new-event" mode="create" initial={editor.initial} /> : <EventEditor key={editor.item.key} mode="edit" item={editor.item} />;
  }
  return editor.mode === "create" ? (
    <TaskEditor key="new-task" mode="create" initial={editor.initial} />
  ) : (
    <TaskEditor key={editor.taskId + (editor.occurrenceKey ?? "")} mode="edit" taskId={editor.taskId} occurrenceKey={editor.occurrenceKey} />
  );
}

function QuickCreate() {
  const open = useUI((s) => s.quickCreate);
  const date = useUI((s) => s.date);
  const path = usePathname();
  const today = useTodayKey();
  const day = path.startsWith("/calendar") ? date : today;
  return (
    <Sheet open={open} size="sm" label="Crear" onClose={() => setQuickCreate(false)}>
      <div className="grid grid-cols-2 gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <button
          onClick={() => openEditor({ type: "event", mode: "create", initial: { startDay: day, endDay: day } })}
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 text-[15px] font-medium transition-colors active:bg-fill"
          data-autofocus
        >
          <CalendarPlus className="size-7 text-accent" />
          Esdeveniment
        </button>
        <button onClick={() => openEditor({ type: "task", mode: "create", initial: path.startsWith("/tasks") ? {} : { scheduled_date: day } })} className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 text-[15px] font-medium transition-colors active:bg-fill">
          <ListPlus className="size-7 text-accent" />
          Tasca
        </button>
      </div>
    </Sheet>
  );
}

/** N: nou esdeveniment · T: nova tasca · Esc: tanca */
function GlobalShortcuts() {
  const path = usePathname();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const date = getUI().date;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        openEditor({ type: "event", mode: "create", initial: path.startsWith("/calendar") ? { startDay: date, endDay: date } : undefined });
      } else if (e.key.toLowerCase() === "t" && !path.startsWith("/calendar")) {
        e.preventDefault();
        openEditor({ type: "task", mode: "create" });
      } else if (e.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path]);
  return null;
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <rect x="12" y="15" width="40" height="36" rx="8" fill="#fff" />
      <rect x="12" y="15" width="40" height="10" rx="5" fill="#fff" opacity=".0" />
      <path d="M22 35.5l6.5 6.5L43 27.5" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FabCreate() {
  return (
    <button aria-label="Crear" onClick={() => setQuickCreate(true)} className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-pop transition-transform active:scale-95 md:hidden">
      <Plus className="size-7" strokeWidth={2.2} />
    </button>
  );
}
