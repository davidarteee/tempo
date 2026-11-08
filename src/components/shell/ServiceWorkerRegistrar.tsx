"use client";
import { useEffect } from "react";
import "@/lib/ui/install"; // captura beforeinstallprompt com més aviat millor

/** Registra el Service Worker (cache de l'app per a ús sense connexió + push) */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !localStorage.getItem("tempo:sw-dev")) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    // Obre l'element en fer clic a una notificació
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "navigate" && typeof e.data.url === "string") window.location.assign(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
  return null;
}
