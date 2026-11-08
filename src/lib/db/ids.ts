/** Identificadors. Els UUID es generen al client (permet creació offline). */

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Alternativa per a entorns antics
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

/**
 * UUID determinista a partir d'un text (dues variants de FNV-1a de 64 bits).
 * S'utilitza per a les excepcions d'ocurrències: dos dispositius que modifiquen la
 * mateixa ocurrència sense connexió generen el mateix id i el conflicte es resol
 * per Last-Write-Wins en lloc de violar la restricció d'unicitat.
 */
export function deterministicUuid(input: string): string {
  const h = (seed: bigint) => {
    let x = 0xcbf29ce484222325n ^ seed;
    for (let i = 0; i < input.length; i++) {
      x ^= BigInt(input.charCodeAt(i));
      x = (x * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return x.toString(16).padStart(16, "0");
  };
  const hex = h(0n) + h(0x9e3779b97f4a7c15n);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function exceptionId(parentId: string, occurrenceKey: string) {
  return deterministicUuid(`${parentId}|${occurrenceKey}`);
}
