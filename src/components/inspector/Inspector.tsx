"use client";

import { useMemo } from "react";
import { CATEGORIES } from "@/knowledge/categories";
import { describePath } from "@/knowledge/graph";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
import { askJarvis } from "@/services/jarvis";
import { formatDate, relativeTime } from "@/lib/format";
import { Dot, PanelTitle } from "@/components/layout/ui";

interface Connection {
  id: string;
  label: string;
  category: keyof typeof CATEGORIES;
  relation: string;
  outgoing: boolean;
}

export default function Inspector() {
  const selected = useJarvis((s) => s.selected);
  const focus = useJarvis((s) => s.focus);
  const graphVersion = useJarvis((s) => s.graphVersion);
  const select = useJarvis((s) => s.select);
  const openViewer = useJarvis((s) => s.openViewer);

  const info = useMemo(() => {
    void graphVersion;
    const graph = getGraph();
    if (!selected || !graph.hasNode(selected)) return null;
    const node = graph.getNodeAttribute(selected, "node");
    const connections: Connection[] = [];
    graph.forEachEdge(selected, (_e, a, src, tgt) => {
      const other = src === selected ? tgt : src;
      connections.push({
        id: other,
        label: graph.getNodeAttribute(other, "label"),
        category: graph.getNodeAttribute(other, "category"),
        relation: a.relation,
        outgoing: src === selected,
      });
    });
    connections.sort((a, b) => a.relation.localeCompare(b.relation) || a.label.localeCompare(b.label));
    return { node, connections, degree: graph.degree(selected) };
  }, [selected, graphVersion]);

  const pathText = useMemo(() => {
    if (focus.kind !== "path") return null;
    return describePath(getGraph(), focus.nodes);
  }, [focus]);

  if (!info) {
    return (
      <section className="panel-section">
        <PanelTitle>Inspector</PanelTitle>
        <p className="text-[12px] leading-relaxed text-ink-dim">
          Click a node to focus it.
          <br />
          Only that node and its connections will light up.
          <br />
          <span className="text-ink-faint">Shift-click</span> a second node to trace the path.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          <span>Click</span><span className="text-ink-dim">focus</span>
          <span>Double-click</span><span className="text-ink-dim">open item</span>
          <span>Shift + click</span><span className="text-ink-dim">trace path</span>
          <span>Drag</span><span className="text-ink-dim">move node</span>
          <span>⌘K</span><span className="text-ink-dim">ask Jarvis</span>
        </div>
      </section>
    );
  }

  const { node, connections, degree } = info;
  const cat = CATEGORIES[node.category];

  return (
    <section className="panel-section flex min-h-0 flex-col" data-testid="inspector">
      <PanelTitle>Inspector</PanelTitle>
      <div className="flex items-start gap-2">
        <Dot color={cat.color} className="mt-[7px]" />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-medium text-ink" title={node.label}>{node.label}</h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: cat.color }}>
            {cat.label}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{node.description}</p>

      {pathText && (
        <div className="mt-3 border-l border-accent/60 bg-accent/5 px-2 py-1.5 text-[11px] leading-relaxed text-accent-soft">
          <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-accent">Traced path</div>
          {pathText}
        </div>
      )}

      <dl className="mt-3 grid grid-cols-[84px_1fr] gap-y-1 font-mono text-[10.5px]">
        <dt className="text-ink-faint">CONNECTIONS</dt>
        <dd className="text-ink-dim">{degree}</dd>
        <dt className="text-ink-faint">IMPORTANCE</dt>
        <dd className="flex items-center gap-2 text-ink-dim">
          <span className="h-[3px] w-20 bg-white/5">
            <span className="block h-full bg-accent/70" style={{ width: `${Math.round(node.importance * 100)}%` }} />
          </span>
          {node.importance.toFixed(2)}
        </dd>
        <dt className="text-ink-faint">UPDATED</dt>
        <dd className="text-ink-dim" title={formatDate(node.updatedAt)}>{relativeTime(node.updatedAt)}</dd>
        <dt className="text-ink-faint">SOURCE</dt>
        <dd className="truncate text-ink-dim" title={node.source}>{node.source}</dd>
        {node.metadata &&
          Object.entries(node.metadata).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="uppercase text-ink-faint">{k}</dt>
              <dd className="truncate text-ink-dim">{String(v)}</dd>
            </div>
          ))}
      </dl>

      {node.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {node.tags.map((t) => (
            <span key={t} className="border border-line px-1.5 py-[1px] font-mono text-[10px] text-ink-dim">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        <ActionButton onClick={() => graphCommands.centerOn(node.id)}>Focus</ActionButton>
        <ActionButton onClick={() => openViewer(node.id)}>Open</ActionButton>
        <ActionButton onClick={() => askJarvis(`show everything related to ${node.label}`)}>Related</ActionButton>
        <ActionButton
          onClick={() => {
            const s = useJarvis.getState();
            if (s.layout === "radial") graphCommands.applyLayout();
            else s.setLayout("radial");
          }}
        >
          Center
        </ActionButton>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1" data-testid="inspector-connections">
        <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-faint">Connections</div>
        <ul className="space-y-px">
          {connections.map((c, i) => (
            <li key={`${c.id}-${c.relation}-${i}`}>
              <button
                className="group flex w-full items-center gap-2 px-1 py-[3px] text-left hover:bg-white/[0.03]"
                onClick={() => {
                  select(c.id);
                  graphCommands.centerOn(c.id);
                }}
              >
                <Dot color={CATEGORIES[c.category].color} size={6} />
                <span className="w-[86px] shrink-0 font-mono text-[9.5px] text-ink-faint">
                  {c.outgoing ? "" : "← "}
                  {c.relation}
                  {c.outgoing ? " →" : ""}
                </span>
                <span className="truncate text-[12px] text-ink-dim group-hover:text-ink">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-line px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-ink-dim transition hover:border-accent/60 hover:text-accent"
    >
      {children}
    </button>
  );
}
