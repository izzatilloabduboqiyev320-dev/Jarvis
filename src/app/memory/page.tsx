import { NodeList, PageFrame, Roadmap } from "@/components/layout/SectionPage";

export const metadata = { title: "Memory · J.A.R.V.I.S." };

export default function MemoryPage() {
  return (
    <PageFrame title="Memory" subtitle="What JARVIS remembers about you: preferences, facts and decisions." phase="Phase 3">
      <NodeList categories={["memory"]} emptyText='No memories yet. Press ⌘K and say "Remember that…".' />
      <Roadmap
        items={[
          "SQLite storage for short-term, long-term, episodic, project, knowledge, preference and task memory",
          "Embeddings + semantic search combining keywords, vectors, graph links, recency and importance",
          "Automatic memory extraction from conversations",
        ]}
      />
    </PageFrame>
  );
}
