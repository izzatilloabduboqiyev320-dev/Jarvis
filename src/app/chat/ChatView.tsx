"use client";

import { useEffect, useRef, useState } from "react";
import { PageFrame } from "@/components/layout/SectionPage";
import { clock } from "@/lib/format";
import { useJarvis } from "@/lib/store";
import { askJarvis } from "@/services/jarvis";

export default function ChatView() {
  const messages = useJarvis((s) => s.messages);
  const hud = useJarvis((s) => s.hud);
  const status = useJarvis((s) => s.status);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void askJarvis(t);
  };

  return (
    <PageFrame
      title="Chat"
      subtitle={status.mode === "demo" ? "Demo mode: answers come from your local knowledge graph. Claude joins in Phase 2." : "Claude key detected. Claude chat arrives in Phase 2."}
      phase="Phase 2"
    >
      <div className="glass flex h-[62vh] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="text-[13px] text-ink-faint">Ask anything about your projects, knowledge or files — e.g. “What am I working on?”</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-faint">
                {m.role === "user" ? "You" : "Jarvis"} · {clock(m.ts)}
              </div>
              <div
                className={`mt-1 inline-block max-w-[80%] border px-3 py-2 text-left text-[13.5px] leading-relaxed ${
                  m.role === "user" ? "border-line text-ink-dim" : "border-accent/25 bg-accent/[0.04] text-ink"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {(hud === "thinking" || hud === "executing") && (
            <div className="animate-pulse font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">Jarvis is {hud}…</div>
          )}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4">
          <span className="font-mono text-[10px] text-accent">›_</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message Jarvis…"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button onClick={send} className="font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-accent">
            Send ↵
          </button>
        </div>
      </div>
    </PageFrame>
  );
}
