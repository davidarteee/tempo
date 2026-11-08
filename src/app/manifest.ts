import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tempo — Calendari i tasques",
    short_name: "Tempo",
    description: "Calendari personal i tasques, en un sol lloc.",
    lang: "ca",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#e8473b",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Avui", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calendari", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tasques", url: "/tasks", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
