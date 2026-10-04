"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/knowledge/categories";
import { searchLabels } from "@/knowledge/query";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
import { askJarvis, openResource, testVoice } from "@/services/jarvis";
import { resourceUrl, sourceName } from "@/lib/external-link";
import { Dot } from "@/components/layout/ui";

type Mode = "root" | "note" | "task" | "memory" | "files";

interface Item {
  key: string;
  group: string;
  label: string;
  hint?: string;
  color?: string;
  run: () => void;
  /** Items with an external link get a ↗ button that opens it. */
  link?: { url: string; open: () => void };
}

const MODES: Record<Exclude<Mode, "root">, { title: string; placeholder: string; toQuery: (t: string) => string }> = {
  note: { title: "Add Note", placeholder: "Write the note — mention projects or concepts to link them…", toQuery: (t) => `add note ${t}` },
  task: { title: "Create Task", placeholder: "Describe the task…", toQuery: (t) => `create task ${t}` },
  memory: { title: "Search Memory", placeholder: "What do you want to recall?", toQuery: (t) => `memories and decisions about ${t}` },
  files: { title: "Search Files", placeholder: "Which files? e.g. ICT, YouTube scripts…", toQuery: (t) => `files related to ${t}` },
};

const SUGGESTIONS = [
  "What am I working on?",
  "Show everything related to ICT",
  "How are Claude and my YouTube project connected?",
  "Show all projects connected to Claude",
  "Find files related to ICT",
  "Remember that JARVIS is high priority",
];

export default function CommandPalette() {
  const open = useJarvis((s) => s.paletteOpen);
  const setOpen = useJarvis((s) => s.setPaletteOpen);

  // Global shortcut: ⌘K / Ctrl+K toggles, Esc closes the viewer or clears focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useJarvis.getState().paletteOpen);
      } else if (e.key === "Escape" && !useJarvis.getState().paletteOpen) {
        const s = useJarvis.getState();
        if (s.viewer) s.openViewer(null);
        else s.clearFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Mounting only while open means every opening starts fresh.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const setOpen = useJarvis((s) => s.setPaletteOpen);
  const messages = useJarvis((s) => s.messages);
  const hud = useJarvis((s) => s.hud);
  const voiceReplies = useJarvis((s) => s.voiceReplies);
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("root");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const changeMode = (m: Mode) => {
    setMode(m);
    setActive(0);
  };

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const submit = (q: string) => {
    if (!q.trim()) return;
    setText("");
    setMode("root");
    setActive(0);
    void askJarvis(q);
  };

  const items: Item[] = (() => {
    const q = text.trim();
    const ql = q.toLowerCase();
    if (mode !== "root") {
      return q
        ? [{ key: "mode-submit", group: MODES[mode].title, label: q, hint: "↵ run", run: () => submit(MODES[mode].toQuery(q)) }]
        : [];
    }
    const commands: Item[] = [
      { key: "c-ask", group: "Commands", label: "Ask Jarvis", hint: "type a question", run: () => changeMode("root") },
      { key: "c-mem", group: "Commands", label: "Search Memory", run: () => changeMode("memory") },
      { key: "c-files", group: "Commands", label: "Search Files", run: () => changeMode("files") },
      { key: "c-note", group: "Commands", label: "Add Note", run: () => changeMode("note") },
      { key: "c-task", group: "Commands", label: "Create Task", run: () => changeMode("task") },
      { key: "c-import", group: "Commands", label: "Import File", hint: "Phase 4", run: () => go("/files") },
      { key: "c-graph", group: "Commands", label: "Show Knowledge Graph", run: () => { go("/graph"); useJarvis.getState().clearFocus(); graphCommands.fit(); } },
      { key: "c-agents", group: "Commands", label: "Open Agents", run: () => go("/agents") },
      { key: "c-skills", group: "Commands", label: "Open Skills", run: () => go("/skills") },
      { key: "c-settings", group: "Commands", label: "Settings", run: () => go("/settings") },
      {
        key: "c-voice",
        group: "Commands",
        label: voiceReplies ? "Turn voice replies off" : "Turn voice replies on",
        hint: "browser voice",
        run: () => useJarvis.getState().setVoiceReplies(!voiceReplies),
      },
      { key: "c-voice-test", group: "Commands", label: "Test voice (Ovozni sinash)", run: () => { void testVoice(); setOpen(false); } },
      { key: "c-reset", group: "Commands", label: "Reset view", run: () => { useJarvis.getState().clearFocus(); graphCommands.fit(); setOpen(false); } },
    ];
    const out: Item[] = [];
    if (q) {
      out.push({ key: "ask", group: "Jarvis", label: q, hint: "↵ ask", run: () => submit(q) });
      const graph = getGraph();
      for (const id of searchLabels(graph, q, 6)) {
        const a = graph.getNodeAttributes(id);
        const url = resourceUrl(a.node);
        out.push({
          key: `n-${id}`,
          group: "Nodes",
          label: a.label,
          hint: url ? sourceName(url) || CATEGORIES[a.category].label : CATEGORIES[a.category].label,
          color: a.color,
          link: url ? { url, open: () => void openResource(a.node) } : undefined,
          run: () => {
            useJarvis.getState().select(id);
            graphCommands.centerOn(id);
            setOpen(false);
          },
        });
      }
      out.push(...commands.filter((c) => c.label.toLowerCase().includes(ql)));
    } else {
      out.push(...SUGGESTIONS.map((s, i) => ({ key: `s-${i}`, group: "Try asking", label: s, run: () => submit(s) })));
      out.push(...commands);
    }
    return out;
  })();

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if ((e.metaKey || e.ctrlKey) && it?.link) it.link.open();
      else it?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== "root") changeMode("root");
      else setOpen(false);
    } else if (e.key === "Backspace" && !text && mode !== "root") {
      changeMode("root");
    }
  };

  let lastGroup = "";
  const busy = hud === "thinking" || hud === "executing";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        className="glass relative w-[640px] max-w-[92vw] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="JARVIS command palette"
        data-testid="command-palette"
      >
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        {messages.length > 0 && (
          <div ref={logRef} className="max-h-[220px] space-y-2 overflow-y-auto border-b border-line px-4 py-3" data-testid="chat-log">
            {messages.filter((m) => m.text).slice(-12).map((m) => (
              <div key={m.id} className={`text-[12.5px] leading-relaxed ${m.role === "user" ? "text-ink-dim" : "text-ink"}`}>
                <span className={`mr-2 font-mono text-[9.5px] uppercase tracking-[0.18em] ${m.role === "user" ? "text-ink-faint" : "text-accent"}`}>
                  {m.role === "user" ? "You" : "Jarvis"}
                </span>
                {m.text}
              </div>
            ))}
            {busy && <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80 animate-pulse">Jarvis is {hud}…</div>}
          </div>
        )}
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            {mode === "root" ? "›_" : MODES[mode].title}
          </span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            placeholder={mode === "root" ? "Ask Jarvis or type a command…" : MODES[mode].placeholder}
            className="h-12 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
            data-testid="palette-input"
          />
          <kbd className="font-mono text-[10px] text-ink-faint">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {items.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-ink-faint">
              {mode === "root" ? "No matches." : "Type, then press Enter."}
            </div>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header && (
                  <div className="px-4 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-faint">{header}</div>
                )}
                <div className="flex items-center">
                  <button
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => it.run()}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 px-4 py-[7px] text-left text-[13px] transition ${
                      i === active ? "bg-accent/[0.08] text-ink" : "text-ink-dim"
                    }`}
                  >
                    {it.color ? <Dot color={it.color} size={7} /> : <span className={`h-[5px] w-[5px] ${i === active ? "bg-accent" : "bg-white/15"}`} />}
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint && <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{it.hint}</span>}
                  </button>
                  {it.link && (
                    <a
                      href={it.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${it.link.url}`}
                      aria-label={`Open ${it.label}`}
                      data-testid="palette-open-resource"
                      onMouseEnter={() => setActive(i)}
                      onClick={(e) => {
                        e.preventDefault();
                        it.link?.open();
                      }}
                      className={`self-stretch px-3 py-[7px] font-mono text-[12px] text-accent transition hover:bg-accent/[0.12] ${i === active ? "bg-accent/[0.08]" : ""}`}
                    >
                      ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
          <span>↑↓ navigate · ↵ select · ⌘↵ open link · esc close</span>
          <span>{voiceReplies ? "voice replies on" : "voice replies off"}</span>
        </div>
      </div>
    </div>
  );
}
