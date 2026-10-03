import { NodeList, PageFrame, Roadmap } from "@/components/layout/SectionPage";

export const metadata = { title: "Skills · J.A.R.V.I.S." };

export default function SkillsPage() {
  return (
    <PageFrame title="Skills" subtitle="Capabilities and the tools that power them." phase="Phase 6">
      <NodeList categories={["skill", "suite", "tool"]} />
      <Roadmap
        items={[
          "Installable skills: name, description, instructions, tools, permissions, triggers",
          "YouTube Skill and Trading Knowledge Skill (read-only — never places trades)",
          "MCP service layer to discover tools from MCP servers",
        ]}
      />
    </PageFrame>
  );
}
