"use client";

import { useMemo } from "react";
import { CATEGORIES } from "@/knowledge/categories";
import { topHubs } from "@/knowledge/graph";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
import { Dot, PanelTitle } from "@/components/layout/ui";

export default function TopHubs() {
  const graphVersion = useJarvis((s) => s.graphVersion);
  const ready = useJarvis((s) => s.ready);
  const selected = useJarvis((s) => s.selected);
  const select = useJarvis((s) => s.select);

  const hubs = useMemo(() => {
    void graphVersion;
    return ready ? topHubs(getGraph(), 9) : [];
  }, [graphVersion, ready]);
  const max = hubs[0]?.degree ?? 1;

  return (
    <section className="panel-section" data-testid="top-hubs">
      <PanelTitle>Top Hubs</PanelTitle>
      <ul className="space-y-px">
        {hubs.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => {
                select(h.id);
                graphCommands.centerOn(h.id);
              }}
              className={`group relative flex w-full items-center gap-2 px-1.5 py-[5px] text-left transition hover:bg-white/[0.03] ${selected === h.id ? "bg-accent/[0.06]" : ""}`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent/[0.05]"
                style={{ width: `${(h.degree / max) * 100}%` }}
                aria-hidden
              />
              <Dot color={CATEGORIES[h.category].color} size={6} />
              <span className="relative flex-1 truncate text-[12px] text-ink-dim group-hover:text-ink">{h.label}</span>
              <span className="relative font-mono text-[10.5px] tabular-nums text-ink-faint group-hover:text-accent">
                {h.degree}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
