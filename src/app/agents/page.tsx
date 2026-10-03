import { NodeList, PageFrame, Roadmap } from "@/components/layout/SectionPage";

export const metadata = { title: "Agents · J.A.R.V.I.S." };

export default function AgentsPage() {
  return (
    <PageFrame title="Agents" subtitle="Specialists JARVIS can delegate to. JARVIS stays the orchestrator." phase="Phase 6">
      <NodeList categories={["agent", "automation"]} />
      <Roadmap
        items={[
          "Agent framework with max steps, timeouts and tool limits (no infinite delegation)",
          "Research → analysis → report pipelines",
          "Every external or destructive step goes through the approval system",
        ]}
      />
    </PageFrame>
  );
}
