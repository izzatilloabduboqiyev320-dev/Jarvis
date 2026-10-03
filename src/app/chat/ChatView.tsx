"use client";

import ChatPanel from "@/components/chat/ChatPanel";
import { PageFrame } from "@/components/layout/SectionPage";
import { useJarvis } from "@/lib/store";

export default function ChatView() {
  const status = useJarvis((s) => s.status);
  return (
    <PageFrame
      title="Chat"
      subtitle={
        status.mode === "demo"
          ? "Demo mode: answers come from your local knowledge graph. Add ANTHROPIC_API_KEY to chat with Claude."
          : "Claude is connected and answers using your knowledge graph."
      }
    >
      <div className="glass h-[68vh]">
        <ChatPanel />
      </div>
    </PageFrame>
  );
}
