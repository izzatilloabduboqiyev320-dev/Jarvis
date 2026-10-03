"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES } from "@/knowledge/categories";
import type { LayoutName } from "@/knowledge/graph";
import { searchLabels } from "@/knowledge/query";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
import { askJarvis } from "@/services/jarvis";
import { Dot } from "@/components/layout/ui";

const LAYOUTS: { id: LayoutName; label: string }[] = [
  { id: "force", label: "Force" },
  { id: "clusters", label: "Clusters" },
  { id: "radial", label: "Radial" },
];

export default function GraphToolbar() {
  const layout = useJarvis((s) => s.layout);
  const setLayout = useJarvis((s) => s.setLayout);
  const recent = useJarvis((s) => s.recent);
  const focus = useJarvis((s) => s.focus);
  const graphVersion = useJarvis((s) => s.graphVersion);
  const ready = useJarvis((s) => s.ready);
  const [q, setQ] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    void graphVersion;
    if (!ready) return { nodes: 0, edges: 0 };
    const g = getGraph();
    return { nodes: g.order, edges: g.size };
  }, [graphVersion, ready]);

  const suggestions = useMemo(() => (q.trim() ? searchLabels(getGraph(), q, 6) : []), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = () => {
    const text = q.trim();
    if (!text) return;
    if (active >= 0 && suggestions[active]) {
      const id = suggestions[active];
      useJarvis.getState().select(id);
      graphCommands.centerOn(id);
    } else {
      void askJarvis(text);
    }
    setShowSuggest(false);
    inputRef.current?.blur();
  };

  const focusLabel =
    focus.kind === "query"
      ? `${focus.nodes.length} nodes in focus`
      : focus.kind === "path"
        ? `path · ${focus.nodes.length - 1} hops`
        : focus.kind === "select"
          ? "node focus"
          : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-3">
      <div className="pointer-events-auto flex items-center gap-px">
        <ToolButton onClick={() => graphCommands.fit()} title="Fit to screen" testId="fit-button">Fit</ToolButton>
        <ToolButton onClick={() => graphCommands.zoomIn()} title="Zoom in">+</ToolButton>
        <ToolButton onClick={() => graphCommands.zoomOut()} title="Zoom out">−</ToolButton>
        <ToolButton
          onClick={() => {
            useJarvis.getState().clearFocus();
            useJarvis.getState().setHidden([]);
            graphCommands.fit();
          }}
          title="Reset focus and filters"
        >
          Reset
        </ToolButton>
      </div>

      <div className="pointer-events-auto relative min-w-0 max-w-[560px] flex-1">
        <div className="glass flex h-8 items-center gap-2 px-3">
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-accent/80" aria-hidden>
            <circle cx="5" cy="5" r="3.8" fill="none" stroke="currentColor" />
            <path d="M8 8l3 3" stroke="currentColor" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShowSuggest(true);
              setActive(-1);
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(suggestions.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              } else if (e.key === "Escape") {
                setQ("");
                inputRef.current?.blur();
              }
            }}
            placeholder='Search or ask — "show everything related to ICT"'
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none"
            data-testid="graph-search"
          />
          <kbd className="shrink-0 font-mono text-[9.5px] text-ink-faint">/</kbd>
          <button
            className="shrink-0 border-l border-line pl-2 font-mono text-[9.5px] text-ink-faint hover:text-accent"
            onClick={() => useJarvis.getState().setPaletteOpen(true)}
            title="Command palette"
          >
            ⌘K
          </button>
        </div>
        {showSuggest && q.trim() && (
          <div className="glass absolute left-0 right-0 top-9 py-1">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setActive(-1);
                void askJarvis(q);
                setShowSuggest(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${active === -1 ? "bg-accent/[0.08] text-ink" : "text-ink-dim"}`}
            >
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-accent">Ask</span>
              <span className="truncate">{q}</span>
            </button>
            {suggestions.map((id, i) => {
              const a = getGraph().getNodeAttributes(id);
              return (
                <button
                  key={id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    useJarvis.getState().select(id);
                    graphCommands.centerOn(id);
                    setShowSuggest(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${active === i ? "bg-accent/[0.08] text-ink" : "text-ink-dim"}`}
                >
                  <Dot color={a.color} size={6} />
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="font-mono text-[9.5px] uppercase text-ink-faint">{CATEGORIES[a.category].label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-px" role="radiogroup" aria-label="Graph layout">
        {LAYOUTS.map((l) => (
          <ToolButton
            key={l.id}
            active={layout === l.id}
            onClick={() => (layout === l.id ? graphCommands.applyLayout() : setLayout(l.id))}
            title={`${l.label} layout`}
          >
            {l.label}
          </ToolButton>
        ))}
      </div>

      <div className="pointer-events-auto relative">
        <ToolButton onClick={() => setShowRecent((v) => !v)} title="Recently viewed nodes" active={showRecent}>
          Recent {recent.length > 0 && <span className="ml-1 text-accent">{recent.length}</span>}
        </ToolButton>
        {showRecent && (
          <div className="glass absolute right-0 top-9 w-56 py-1" onMouseLeave={() => setShowRecent(false)}>
            {recent.length === 0 && <div className="px-3 py-2 text-[11.5px] text-ink-faint">No recent nodes yet.</div>}
            {recent.map((id) => {
              const g = getGraph();
              if (!g.hasNode(id)) return null;
              const a = g.getNodeAttributes(id);
              return (
                <button
                  key={id}
                  onClick={() => {
                    useJarvis.getState().select(id);
                    graphCommands.centerOn(id);
                    setShowRecent(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-dim hover:bg-accent/[0.06] hover:text-ink"
                >
                  <Dot color={a.color} size={6} />
                  <span className="truncate">{a.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pointer-events-auto ml-auto hidden flex-col items-end gap-0.5 pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint xl:flex">
        <span>
          <span className="text-ink-dim">{stats.nodes}</span> nodes · <span className="text-ink-dim">{stats.edges}</span> links
        </span>
        {focusLabel && (
          <button className="text-accent/80 hover:text-accent" onClick={() => useJarvis.getState().clearFocus()} title="Clear focus (Esc)">
            {focusLabel} ✕
          </button>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  title,
  active,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={`glass h-8 min-w-8 px-2.5 font-mono text-[10px] uppercase tracking-wider transition ${
        active ? "border-accent/50 text-accent" : "text-ink-dim hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
