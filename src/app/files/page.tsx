import { NodeList, PageFrame, Roadmap } from "@/components/layout/SectionPage";

export const metadata = { title: "Files · J.A.R.V.I.S." };

export default function FilesPage() {
  return (
    <PageFrame title="Files" subtitle="Documents in your knowledge graph." phase="Phase 4">
      <div className="mb-6 flex h-28 items-center justify-center border border-dashed border-line text-[13px] text-ink-faint">
        Drag-and-drop import (PDF, TXT, Markdown, DOCX) arrives in Phase 4.
      </div>
      <NodeList categories={["file", "book", "video", "web"]} />
      <Roadmap
        items={[
          "Upload → extract text → chunk → Claude entity extraction → embeddings → nodes + relationships",
          "Sanitised file names and protected paths",
          "Later: images, audio and video",
        ]}
      />
    </PageFrame>
  );
}
