"use client";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Check } from "lucide-react";

type Variant = "primary" | "secondary" | "plain" | "danger" | "tinted";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }>(
  function Button({ variant = "secondary", size = "md", className, ...props }, ref) {
    return (
      <button
        ref={ref}
        {...props}
        className={cn(
          "inline-flex select-none items-center justify-center gap-1.5 rounded-[10px] font-medium transition-[background,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
          size === "sm" && "h-8 px-3 text-[13px]",
          size === "md" && "h-9 px-3.5 text-[14px]",
          size === "lg" && "h-11 px-5 text-[15px]",
          variant === "primary" && "bg-accent text-white hover:brightness-[1.04]",
          variant === "secondary" && "bg-fill text-text hover:bg-fill-strong",
          variant === "tinted" && "bg-accent-soft text-accent hover:brightness-95",
          variant === "plain" && "text-accent hover:bg-fill",
          variant === "danger" && "bg-fill text-danger hover:bg-fill-strong",
          className,
        )}
      />
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }>(
  function IconButton({ label, size = "md", className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        {...props}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-fill hover:text-text active:bg-fill-strong disabled:opacity-40",
          size === "md" ? "size-9" : "size-7",
          className,
        )}
      >
        {children}
      </button>
    );
  },
);

/** Casella rodona de compleció (estil Recordatoris) */
export function TaskCheck({ checked, color, onChange, label, size = 20 }: { checked: boolean; color: string; onChange: () => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full transition-[background,border-color] duration-150", checked && "anim-check")}
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${checked ? color : "var(--separator-strong)"}`,
        background: checked ? color : "transparent",
      }}
    >
      {checked && <Check className="text-white" strokeWidth={3} style={{ width: size * 0.6, height: size * 0.6 }} />}
      <span className="absolute -inset-2" />
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40", checked ? "bg-success" : "bg-fill-strong")}
    >
      <span
        className="absolute top-[2px] left-[2px] size-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-[var(--ease-out-quint)]"
        style={{ transform: checked ? "translateX(18px)" : "none" }}
      />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className, size = "md" }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-[9px] bg-fill p-[2px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          title={o.title}
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[7px] px-3 font-medium whitespace-nowrap transition-[background,color,box-shadow] duration-150",
            size === "md" ? "h-7 text-[13px]" : "h-6 text-[12px]",
            o.value === value ? "bg-elevated text-text shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]" : "text-text-2 hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Grup de files estil "llista agrupada" */
export function Group({ children, className, title, footer }: { children: ReactNode; className?: string; title?: ReactNode; footer?: ReactNode }) {
  return (
    <section className={className}>
      {title && <h3 className="mb-1.5 px-4 text-[12px] font-medium tracking-wide text-text-3 uppercase">{title}</h3>}
      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-surface [&>*]:border-separator">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12px] leading-snug text-text-3">{footer}</p>}
    </section>
  );
}

export function Row({ label, children, icon, className, onClick, htmlFor }: { label?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string; onClick?: () => void; htmlFor?: string }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("flex min-h-[44px] w-full items-center gap-3 px-4 py-1.5 text-left text-[15px]", onClick && "transition-colors hover:bg-fill/50 active:bg-fill", className)}
    >
      {icon && <span className="flex size-5 shrink-0 items-center justify-center text-text-2">{icon}</span>}
      {label && (
        <label htmlFor={htmlFor} className="shrink-0 text-text">
          {label}
        </label>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-text-2">{children}</div>
    </Comp>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn("w-full min-w-0 bg-transparent outline-none placeholder:text-text-3", className)} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} className={cn("w-full min-w-0 resize-none bg-transparent outline-none placeholder:text-text-3", className)} />;
});

/** Pastilla per a valors de data/hora (input natiu a sota, accessible i tàctil) */
export function PillInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "tabular h-8 rounded-lg bg-fill px-2.5 text-[15px] text-text outline-none [color-scheme:inherit] focus:ring-2 focus:ring-link/40",
        props.className,
      )}
    />
  );
}

export function NativeSelect({ value, onChange, children, className, label }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("max-w-[60%] cursor-pointer appearance-none truncate rounded-lg bg-transparent py-1 pr-1 text-right text-[15px] text-text-2 outline-none hover:text-text", className)}
    >
      {children}
    </select>
  );
}

export function ColorDot({ color, size = 10, className }: { color: string; size?: number; className?: string }) {
  return <span aria-hidden className={cn("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: color }} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-separator bg-surface-2 px-1 font-sans text-[11px] text-text-3">{children}</kbd>;
}
