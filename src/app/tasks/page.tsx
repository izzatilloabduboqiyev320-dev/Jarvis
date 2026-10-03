import { NodeList, PageFrame } from "@/components/layout/SectionPage";

export const metadata = { title: "Tasks · J.A.R.V.I.S." };

export default function TasksPage() {
  return (
    <PageFrame title="Tasks & Goals" subtitle='Open work and the goals it serves. Create one with ⌘K → "Create Task".'>
      <NodeList categories={["task", "goal", "project"]} />
    </PageFrame>
  );
}
