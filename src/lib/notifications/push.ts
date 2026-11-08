"use client";
/**
 * Permisos i subscripció Web Push.
 * iOS/iPadOS: només funciona amb l'aplicació instal·lada a la pantalla d'inici (16.4+).
 */
import { authHeader } from "../supabase/client";

export type PushSupport = "supported" | "needs-install" | "unsupported";

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = "serviceWorker" in navigator && "Notification" in window;
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!hasApis) return "unsupported";
  return "PushManager" in window ? "supported" : "unsupported";
}

export const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** Subscriu el dispositiu al servidor de push (si hi ha clau VAPID i sessió) */
export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!vapidPublicKey) return { ok: false, reason: "El servidor no té configurades les claus VAPID." };
  const perm = await requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permís de notificacions denegat." };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) return { ok: false, reason: "No s'ha pogut registrar el dispositiu." };
  return { ok: true };
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

export async function currentPushSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager?.getSubscription()) ?? null;
}

export async function showLocalNotification(title: string, body: string, tag: string, url: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) {
    await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/badge-72.png", data: { url } });
    return true;
  }
  new Notification(title, { body, tag });
  return true;
}
