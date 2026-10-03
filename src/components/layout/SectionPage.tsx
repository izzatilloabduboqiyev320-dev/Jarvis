"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/knowledge/categories";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph } from "@/lib/graph-instance";
import { relativeTime } from "@/lib/format";
import { useJarvis } from "@/lib/store";
import { Dot, PanelTitle } from "@/components/layout/ui";
import type { NodeCategory } from "@/types/graph";

export function PageFrame({
  title,
  subtitle,
  phase,
  children,
}: {
  title: string;
  subtitle: string;
  phase?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-10 py-8">
        <header className="mb-8 flex items-end justify-between border-b border-line pb-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent/80">J.A.R.V.I.S. //</div>
            <h1 className="mt-1 text-2xl font-light tracking-wide text-ink">{title}</h1>
            <p className="mt-1 text-[13px] text-ink-dim">{subtitle}</p>
          </div>
          {phase && (
            <span className="border border-accent/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80">
              {phase}
            </span>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Lists graph nodes of the given categories; click jumps to the node in the graph. */
export function NodeList({ categories, emptyText }: { categories: NodeCategory[]; emptyText?: string }) {
  const ready = useJarvis((s) => s.ready);
  const graphVersion = useJarvis((s) => s.graphVersion);
  const [q, setQ] = useState("");
  const router = useRouter();

  const nodes = useMemo(() => {
    void graphVersion;
    if (!ready) return [];
    const g = getGraph();
    return g
      .filterNodes((_, a) => categories.includes(a.category))
      .map((id) => ({ ...g.getNodeAttribute(id, "node"), degree: g.degree(id) }))
      .filter((n) => !q || `${n.label} ${n.description} ${n.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [ready, graphVersion, categories, q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter…"
        className="glass mb-4 h-9 w-72 px-3 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
      {!ready && <div className="font-mono text-[11px] text-ink-faint">Loading…</div>}
      {ready && nodes.length === 0 && <div className="text-[13px] text-ink-faint">{emptyText ?? "Nothing here yet."}</div>}
      <div className="grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-2">
        {nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              useJarvis.getState().select(n.id);
              router.push("/graph");
              setTimeout(() => graphCommands.centerOn(n.id), 400);
            }}
            className="group bg-[#03080b] p-4 text-left transition hover:bg-[#061117]"
          >
            <div className="flex items-center gap-2">
              <Dot color={CATEGORIES[n.category].color} size={7} />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em]" style={{ color: CATEGORIES[n.category].color }}>
                {CATEGORIES[n.category].label}
              </span>
              <span className="ml-auto font-mono text-[10px] text-ink-faint">{relativeTime(n.updatedAt)}</span>
            </div>
            <div className="mt-1.5 text-[14px] text-ink group-hover:text-accent">{n.label}</div>
            <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-dim">{n.description}</div>
            <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-ink-faint">
              <span>{n.degree} connections</span>
              {n.metadata?.status && <span>status: {String(n.metadata.status)}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Roadmap({ items }: { items: string[] }) {
  return (
    <section className="mt-10">
      <PanelTitle>Coming next</PanelTitle>
      <ul className="space-y-1.5 text-[13px] text-ink-dim">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-[5px] w-[5px] shrink-0 bg-accent/50" />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}
