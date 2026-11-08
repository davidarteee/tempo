/**
 * Usuari actiu. En mode local (sense Supabase configurat) l'usuari és "local".
 */
export const LOCAL_USER = "local";

let currentUserId: string | null = null;
const listeners = new Set<() => void>();

export function getUserId(): string {
  return currentUserId ?? LOCAL_USER;
}

export function setUserId(id: string | null) {
  currentUserId = id;
  listeners.forEach((l) => l());
}

export function onUserChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
