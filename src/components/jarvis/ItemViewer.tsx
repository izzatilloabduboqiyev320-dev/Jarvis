"use client";

import { useMemo } from "react";
import { CATEGORIES } from "@/knowledge/categories";
import { getGraph } from "@/lib/graph-instance";
import { formatDate, relativeTime } from "@/lib/format";
import { useJarvis } from "@/lib/store";
import { Dot } from "@/components/layout/ui";

/** Opened by double-clicking a node: the "associated item" view. */
export default function ItemViewer() {
  const viewer = useJarvis((s) => s.viewer);
  const close = () => useJarvis.getState().openViewer(null);
  const graphVersion = useJarvis((s) => s.graphVersion);

  const data = useMemo(() => {
    void graphVersion;
    const g = getGraph();
    if (!viewer || !g.hasNode(viewer)) return null;
    const node = g.getNodeAttribute(viewer, "node");
    return { node, degree: g.degree(viewer) };
  }, [viewer, graphVersion]);

  if (!data) return null;
  const { node, degree } = data;
  const cat = CATEGORIES[node.category];
  const fileLike = node.category === "file";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onMouseDown={close}>
      <div
        className="glass relative w-[620px] max-w-[92vw] p-6"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={node.label}
        data-testid="item-viewer"
      >
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Dot color={cat.color} size={10} className="mt-2" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: cat.color }}>{cat.label}</div>
              <h2 className="text-xl font-medium text-ink">{node.label}</h2>
            </div>
          </div>
          <button onClick={close} className="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-accent">
            Close · Esc
          </button>
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-ink-dim">{node.description}</p>
        {node.content && (
          <pre className="mt-4 whitespace-pre-wrap border-l border-accent/40 bg-white/[0.02] px-4 py-3 font-sans text-[13px] leading-relaxed text-ink">
            {node.content}
          </pre>
        )}
        {fileLike && !node.content && (
          <div className="mt-4 border border-dashed border-line px-4 py-3 text-[12px] text-ink-faint">
            File preview and full-text extraction arrive with file ingestion (Phase 4). Source: {node.source}
          </div>
        )}
        <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-1.5 font-mono text-[11px]">
          <dt className="text-ink-faint">CONNECTIONS</dt><dd className="text-ink-dim">{degree}</dd>
          <dt className="text-ink-faint">IMPORTANCE</dt><dd className="text-ink-dim">{node.importance.toFixed(2)}</dd>
          <dt className="text-ink-faint">UPDATED</dt><dd className="text-ink-dim">{formatDate(node.updatedAt)} · {relativeTime(node.updatedAt)}</dd>
          <dt className="text-ink-faint">SOURCE</dt><dd className="text-ink-dim">{node.source}</dd>
          <dt className="text-ink-faint">ID</dt><dd className="text-ink-faint">{node.id}</dd>
          {node.metadata &&
            Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="uppercase text-ink-faint">{k}</dt>
                <dd className="text-ink-dim">{String(v)}</dd>
              </div>
            ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-1">
          {node.tags.map((t) => (
            <span key={t} className="border border-line px-1.5 py-[1px] font-mono text-[10px] text-ink-dim">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
