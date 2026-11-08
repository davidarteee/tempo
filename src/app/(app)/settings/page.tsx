import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/SettingsScreen";

export const metadata: Metadata = { title: "Ajustos" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
