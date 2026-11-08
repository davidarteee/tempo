import type { Metadata } from "next";
import { TodayScreen } from "@/components/today/TodayScreen";
import { FabCreate } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Avui" };

export default function TodayPage() {
  return (
    <>
      <TodayScreen />
      <FabCreate />
    </>
  );
}
