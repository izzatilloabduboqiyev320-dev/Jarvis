"use client";

import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/format";
import { useJarvis } from "@/lib/store";
import { askJarvis, clearChat } from "@/services/jarvis";

/** Conversation with JARVIS: used as the dock on the graph page and full-size on /chat. */
export default function ChatPanel({ compact = false }: { compact?: boolean }) {
  const messages = useJarvis((s) => s.messages);
  const hud = useJarvis((s) => s.hud);
  const mode = useJarvis((s) => s.status.mode);
  const uz = useJarvis((s) => s.voiceLang === "uz-UZ");
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const busy = hud === "thinking" || hud === "executing";

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, hud]);

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    void askJarvis(t);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-panel">
      <div ref={listRef} className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${compact ? "p-3" : "p-5"}`}>
        {mode === "demo" && (
          <div className="border border-amber-300/25 bg-amber-300/[0.04] px-3 py-2 text-[12px] leading-relaxed text-amber-200/80">
            {uz
              ? "Demo rejim: javoblar sizning bilim grafingizdan olinadi. Claude bilan to'liq suhbat uchun .env.local fayliga ANTHROPIC_API_KEY qo'shing."
              : "Demo mode: answers come from your knowledge graph. Add ANTHROPIC_API_KEY to .env.local to chat with Claude."}
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-[13px] text-ink-faint">
            {uz ? "JARVIS'ga yozing, masalan: “Nima ustida ishlayapman?”" : "Ask anything, e.g. “What am I working on?”"}
          </div>
        )}
        {messages.map((m) =>
          m.text || m.role === "user" ? (
            <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
                {m.role === "user" ? (uz ? "Siz" : "You") : "Jarvis"} · {clock(m.ts)}
              </div>
              <div
                className={`mt-1 inline-block max-w-[88%] whitespace-pre-wrap border px-3 py-2 text-left leading-relaxed ${
                  compact ? "text-[12.5px]" : "text-[13.5px]"
                } ${m.role === "user" ? "border-line text-ink-dim" : "border-accent/25 bg-accent/[0.04] text-ink"}`}
              >
                {m.text}
              </div>
            </div>
          ) : null,
        )}
        {busy && (
          <div className="animate-pulse font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
            {uz ? "Jarvis o'ylayapti…" : `Jarvis is ${hud}…`}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3">
        <span className="font-mono text-[10px] text-accent">›_</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
          placeholder={uz ? "Jarvis'ga yozing…" : "Message Jarvis…"}
          maxLength={4000}
          className={`flex-1 bg-transparent text-ink placeholder:text-ink-faint focus:outline-none ${compact ? "h-10 text-[13px]" : "h-12 text-[14px]"}`}
          data-testid="chat-input"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-accent disabled:opacity-40"
          data-testid="chat-send"
        >
          {uz ? "Yuborish ↵" : "Send ↵"}
        </button>
        {messages.length > 0 && (
          <button
            onClick={() => {
              if (confirm(uz ? "Suhbat tarixini o'chirasizmi?" : "Clear the conversation?")) clearChat();
            }}
            className="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-rose-300"
            title={uz ? "Suhbatni tozalash" : "Clear conversation"}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
