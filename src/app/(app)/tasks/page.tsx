import type { Metadata } from "next";
import { TasksScreen } from "@/components/tasks/TasksScreen";
import { FabCreate } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Tasques" };

export default function TasksPage() {
  return (
    <>
      <TasksScreen />
      <FabCreate />
    </>
  );
}
