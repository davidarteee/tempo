import type { CSSProperties } from "react";

/** Estils derivats del color de categoria, ajustats per a clar/fosc via color-mix */
export function eventStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 17%, var(--surface))`,
    color: `color-mix(in srgb, ${color} 62%, var(--text))`,
    boxShadow: `inset 3px 0 0 ${color}`,
  };
}

export function taskStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 7%, var(--surface))`,
    color: `var(--text)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
  };
}

export function solidChip(color: string): CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 85%, black 0%)`,
    color: "#fff",
  };
}
