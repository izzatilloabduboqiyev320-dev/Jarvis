"use client";

import { useState } from "react";
import { useJarvis } from "@/lib/store";
import ChatPanel from "./ChatPanel";

/** Collapsible chat window in the bottom-right corner of the graph. */
export default function ChatDock() {
  const [open, setOpen] = useState(true);
  const uz = useJarvis((s) => s.voiceLang === "uz-UZ");
  const count = useJarvis((s) => s.messages.length);

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-10 flex w-[380px] max-w-[calc(100%-24px)] flex-col" data-testid="chat-dock">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 self-end pb-1 font-mono text-[9.5px] uppercase tracking-[0.22em] text-accent/80 hover:text-accent"
        data-testid="chat-toggle"
      >
        <span className="h-px w-3 bg-accent/60" />
        {uz ? "Suhbat" : "Chat"}
        {!open && count > 0 && <span className="text-ink-faint">({count})</span>}
        <span className="text-ink-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="glass h-[340px] max-h-[55vh]">
          <ChatPanel compact />
        </div>
      )}
    </div>
  );
}
