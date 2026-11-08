"use client";
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { CATEGORY_COLORS, countCategoryUsage, createCategory, deleteCategory, updateCategory } from "@/lib/db/repo";
import type { Category } from "@/lib/types";
import { Group } from "../ui/primitives";
import { Sheet, SheetHeader } from "../ui/Sheet";
import { toast } from "../ui/feedback";
import { cn } from "@/lib/cn";

/** Categories compartides per esdeveniments i tasques */
export function CategoryManager() {
  const { categories } = useStore();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<{ cat: Category; events: number; tasks: number } | null>(null);

  return (
    <>
      <Group title="Categories" footer="Les categories són compartides per esdeveniments i tasques; cada element hereta el color de la seva categoria.">
        {categories.map((c) => (
          <div key={c.id} className="group flex min-h-[44px] items-center gap-3 px-4">
            <button type="button" onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" aria-label={`Edita ${c.name}`}>
              <span className="size-[14px] shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="truncate text-[15px]">{c.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Elimina ${c.name}`}
              onClick={async () => {
                const usage = await countCategoryUsage(c.id);
                if (!usage.events && !usage.tasks) {
                  await deleteCategory(c.id, null);
                  toast(`Categoria "${c.name}" eliminada`);
                } else setDeleting({ cat: c, ...usage });
              }}
              className="rounded-full p-1.5 text-text-3 transition-opacity hover:bg-fill hover:text-danger md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setEditing("new")} className="flex min-h-[44px] w-full items-center gap-3 px-4 text-[15px] text-accent hover:bg-fill/50">
          <Plus className="size-4" /> Nova categoria
        </button>
      </Group>

      {editing && <CategoryEditor key={editing === "new" ? "new" : editing.id} cat={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCategory info={deleting} others={categories.filter((c) => c.id !== deleting.cat.id)} onClose={() => setDeleting(null)} />}
    </>
  );
}

function CategoryEditor({ cat, onClose }: { cat: Category | null; onClose: () => void }) {
  const { categories } = useStore();
  const used = new Set(categories.map((c) => c.color));
  const [name, setName] = useState(cat?.name ?? "");
  const [color, setColor] = useState(cat?.color ?? CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[0]);
  const [custom, setCustom] = useState(false);
  const save = async () => {
    const n = name.trim();
    if (!n) return;
    if (cat) await updateCategory(cat.id, { name: n, color });
    else await createCategory(n, color);
    onClose();
  };
  return (
    <Sheet open size="sm" label={cat ? "Edita la categoria" : "Nova categoria"} onClose={onClose}>
      <SheetHeader title={cat ? "Categoria" : "Nova categoria"} onCancel={onClose} onDone={save} doneDisabled={!name.trim()} doneLabel="Desa" />
      <form
        className="space-y-5 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col items-center gap-3 pt-2">
          <span className="flex size-16 items-center justify-center rounded-full text-[26px] font-semibold text-white" style={{ background: color }}>
            {name.trim().charAt(0).toUpperCase() || "·"}
          </span>
          <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nom" aria-label="Nom de la categoria" className="h-11 w-full rounded-xl bg-surface px-4 text-center text-[17px] font-medium outline-none dark:bg-surface-3" />
        </div>
        <div className="rounded-xl bg-surface p-4 dark:bg-surface-3">
          <div className="grid grid-cols-6 gap-3" role="radiogroup" aria-label="Color">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c.toLowerCase() === color.toLowerCase()}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn("flex aspect-square items-center justify-center rounded-full transition-transform active:scale-90", c.toLowerCase() === color.toLowerCase() && "ring-2 ring-text-3 ring-offset-2 ring-offset-surface")}
                style={{ background: c }}
              >
                {c.toLowerCase() === color.toLowerCase() && <Check className="size-4 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-[14px]">
            <button type="button" onClick={() => setCustom((v) => !v)} className="text-accent">
              Color personalitzat
            </button>
            {custom && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color personalitzat" className="h-8 w-14 cursor-pointer rounded-md border-0 bg-transparent" />}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function DeleteCategory({ info, others, onClose }: { info: { cat: Category; events: number; tasks: number }; others: Category[]; onClose: () => void }) {
  const [target, setTarget] = useState<string>("");
  const parts = [info.events && `${info.events} ${info.events === 1 ? "esdeveniment" : "esdeveniments"}`, info.tasks && `${info.tasks} ${info.tasks === 1 ? "tasca" : "tasques"}`].filter(Boolean).join(" i ");
  const confirm = async () => {
    await deleteCategory(info.cat.id, target || null);
    toast(`Categoria "${info.cat.name}" eliminada`);
    onClose();
  };
  return (
    <Sheet open size="sm" label="Elimina la categoria" onClose={onClose}>
      <SheetHeader title={`Eliminar "${info.cat.name}"`} onCancel={onClose} onDone={confirm} doneLabel="Elimina" />
      <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p className="px-1 text-[14px] text-text-2">Aquesta categoria té {parts}. On vols moure&apos;ls?</p>
        <Group>
          {[{ id: "", name: "Sense categoria", color: "#8E8E93" }, ...others].map((c) => (
            <button key={c.id} type="button" onClick={() => setTarget(c.id)} className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-[15px] hover:bg-fill/50" role="radio" aria-checked={target === c.id}>
              <span className="size-3 rounded-full" style={{ background: c.color }} />
              <span className="flex-1">{c.name}</span>
              {target === c.id && <Check className="size-4 text-accent" strokeWidth={3} />}
            </button>
          ))}
        </Group>
      </div>
    </Sheet>
  );
}
