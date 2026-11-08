"use client";
/**
 * Arrossegar i deixar anar unificat (ratolí, llapis i tàctil).
 *
 * Les zones de destinació es declaren amb atributs de dades:
 *   data-drop="day"  data-day="YYYY-MM-DD"            → carril de tot el dia (converteix en tot el dia)
 *   data-drop="date" data-day="YYYY-MM-DD"            → cel·la del mes (conserva l'hora)
 *   data-drop="time" data-day="YYYY-MM-DD" data-ppm="…" → columna horària (píxels per minut)
 *
 * Ratolí: comença en moure's 4 px. Tàctil: pulsació llarga (300 ms) per no
 * interferir amb el desplaçament.
 */

export interface DropTarget {
  day: string;
  minutes: number | null;
  /** true si la destinació és un dia sencer que ha de conservar l'hora de l'element (vista mensual) */
  keepTime?: boolean;
}

export interface DragSpec {
  label: string;
  color: string;
  /** minuts entre l'inici de l'element i el punt on s'ha agafat (per a moviments a la línia temporal) */
  grabOffsetMin?: number;
  durationMin?: number;
  onDrop: (t: DropTarget) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

const SNAP = 15;
let active: null | {
  spec: DragSpec;
  ghost: HTMLDivElement;
  over: HTMLElement | null;
  target: DropTarget | null;
  x: number;
  y: number;
  raf: number | null;
} = null;

let touchGuardInstalled = false;
function installTouchGuard() {
  if (touchGuardInstalled || typeof window === "undefined") return;
  touchGuardInstalled = true;
  window.addEventListener(
    "touchmove",
    (e) => {
      if (active) e.preventDefault();
    },
    { passive: false },
  );
}

export function isDragging() {
  return active !== null;
}

function makeGhost(spec: DragSpec) {
  const g = document.createElement("div");
  g.setAttribute("aria-hidden", "true");
  g.style.cssText = `position:fixed;left:0;top:0;z-index:80;pointer-events:none;max-width:220px;padding:6px 10px;border-radius:9px;font-size:13px;font-weight:600;color:#fff;background:${spec.color};box-shadow:0 10px 30px -6px rgba(0,0,0,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;will-change:transform;transition:opacity .12s;`;
  g.textContent = spec.label;
  document.body.appendChild(g);
  return g;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function resolve(x: number, y: number): { el: HTMLElement | null; target: DropTarget | null } {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  const el = hit?.closest<HTMLElement>("[data-drop]") ?? null;
  if (!el || !el.dataset.day) return { el: null, target: null };
  if (el.dataset.drop === "time") {
    const ppm = Number(el.dataset.ppm || 1);
    const rect = el.getBoundingClientRect();
    const raw = (y - rect.top) / ppm - (active?.spec.grabOffsetMin ?? 0);
    const dur = active?.spec.durationMin ?? 0;
    const snapped = Math.round(raw / SNAP) * SNAP;
    const minutes = Math.max(0, Math.min(24 * 60 - Math.max(SNAP, Math.min(dur, 24 * 60 - SNAP)), snapped));
    return { el, target: { day: el.dataset.day, minutes } };
  }
  return { el, target: { day: el.dataset.day, minutes: null, keepTime: el.dataset.drop === "date" } };
}

function autoScroll(x: number, y: number) {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  const sc = hit?.closest<HTMLElement>("[data-drag-scroll]");
  if (!sc) return;
  const r = sc.getBoundingClientRect();
  const edge = 48;
  if (y < r.top + edge) sc.scrollTop -= Math.ceil((r.top + edge - y) / 4);
  else if (y > r.bottom - edge) sc.scrollTop += Math.ceil((y - (r.bottom - edge)) / 4);
  if (sc.dataset.dragScroll === "x") {
    if (x < r.left + edge) sc.scrollLeft -= 8;
    else if (x > r.right - edge) sc.scrollLeft += 8;
  }
}

function frame() {
  if (!active) return;
  const { x, y, ghost } = active;
  ghost.style.transform = `translate(${x + 12}px, ${y - 18}px)`;
  const { el, target } = resolve(x, y);
  if (el !== active.over) {
    active.over?.removeAttribute("data-drop-over");
    el?.setAttribute("data-drop-over", "");
    active.over = el;
  }
  active.target = target;
  const time = target?.minutes != null ? ` · ${pad(Math.floor(target.minutes / 60))}:${pad(target.minutes % 60)}` : "";
  ghost.textContent = active.spec.label + time;
  autoScroll(x, y);
  active.raf = requestAnimationFrame(frame);
}

function begin(spec: DragSpec, x: number, y: number) {
  installTouchGuard();
  active = { spec, ghost: makeGhost(spec), over: null, target: null, x, y, raf: null };
  document.documentElement.classList.add("dragging-active");
  spec.onStart?.();
  navigator.vibrate?.(10);
  active.raf = requestAnimationFrame(frame);
}

function finish(drop: boolean) {
  if (!active) return;
  const a = active;
  active = null;
  if (a.raf) cancelAnimationFrame(a.raf);
  a.over?.removeAttribute("data-drop-over");
  a.ghost.remove();
  document.documentElement.classList.remove("dragging-active");
  a.spec.onEnd?.();
  // Evita el clic que segueix al deixar anar
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 50);
  if (drop && a.target) a.spec.onDrop(a.target);
}

/**
 * Connecta a onPointerDown d'un element arrossegable.
 * `getSpec` es crida només si l'arrossegament s'activa.
 */
export function dragHandle(e: React.PointerEvent, getSpec: () => DragSpec | null) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const touch = e.pointerType === "touch" || e.pointerType === "pen";
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = (x: number, y: number) => {
    const spec = getSpec();
    if (!spec) return cleanup();
    started = true;
    begin(spec, x, y);
  };

  const move = (ev: PointerEvent) => {
    if (started && active) {
      active.x = ev.clientX;
      active.y = ev.clientY;
      return;
    }
    const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
    if (touch) {
      if (dist > 8) cleanup(); // l'usuari vol desplaçar-se
    } else if (dist > 4) start(ev.clientX, ev.clientY);
  };
  const touchMove = (ev: TouchEvent) => {
    if (started && active && ev.touches[0]) {
      active.x = ev.touches[0].clientX;
      active.y = ev.touches[0].clientY;
    }
  };
  const up = () => {
    const wasStarted = started;
    cleanup();
    if (wasStarted) finish(true);
  };
  const cancel = () => {
    // En tàctil, el navegador pot cancel·lar el punter: seguim amb touch events
    if (started && touch) return;
    cleanup();
    if (started) finish(false);
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      cleanup();
      finish(false);
    }
  };
  const touchEnd = () => {
    if (started) up();
    else cleanup();
  };

  function cleanup() {
    if (timer) clearTimeout(timer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("touchmove", touchMove);
    window.removeEventListener("touchend", touchEnd);
    window.removeEventListener("keydown", key);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key);
  if (touch) {
    installTouchGuard();
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("touchend", touchEnd);
    timer = setTimeout(() => start(startX, startY), 300);
  }
}
