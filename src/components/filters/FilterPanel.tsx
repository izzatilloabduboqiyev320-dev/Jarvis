"use client";

import { useMemo } from "react";
import { CATEGORIES } from "@/knowledge/categories";
import { categoryCounts } from "@/knowledge/graph";
import { getGraph } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
import { PanelTitle } from "@/components/layout/ui";
import type { NodeCategory } from "@/types/graph";

export default function FilterPanel() {
  const graphVersion = useJarvis((s) => s.graphVersion);
  const ready = useJarvis((s) => s.ready);
  const hidden = useJarvis((s) => s.hidden);
  const toggle = useJarvis((s) => s.toggleCategory);
  const setHidden = useJarvis((s) => s.setHidden);

  const counts = useMemo(() => {
    void graphVersion;
    return ready ? categoryCounts(getGraph()) : null;
  }, [graphVersion, ready]);

  const cats = (Object.keys(CATEGORIES) as NodeCategory[]).filter((c) => (counts?.[c] ?? 0) > 0);
  const total = cats.reduce((n, c) => n + (hidden.includes(c) ? 0 : counts?.[c] ?? 0), 0);

  return (
    <section className="panel-section" data-testid="filter-panel">
      <PanelTitle
        right={
          <button
            className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint hover:text-accent"
            onClick={() => setHidden(hidden.length ? [] : cats.filter((c) => c !== "person"))}
          >
            {hidden.length ? "Show all" : "Hide all"}
          </button>
        }
      >
        Filter
      </PanelTitle>
      <ul className="space-y-px">
        {cats.map((c) => {
          const on = !hidden.includes(c);
          const style = CATEGORIES[c];
          return (
            <li key={c}>
              <label
                className={`group flex cursor-pointer items-center gap-2 px-1.5 py-[4px] transition hover:bg-white/[0.03] ${on ? "" : "opacity-45"}`}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  onChange={() => toggle(c)}
                  data-testid={`filter-${c}`}
                />
                <span
                  className="flex h-[11px] w-[11px] shrink-0 items-center justify-center border transition peer-focus-visible:ring-1 peer-focus-visible:ring-accent"
                  style={{ borderColor: on ? style.color : "rgba(255,255,255,0.15)" }}
                >
                  {on && <span className="h-[5px] w-[5px]" style={{ background: style.color, boxShadow: `0 0 5px ${style.color}` }} />}
                </span>
                <span className="flex-1 text-[12px] text-ink-dim group-hover:text-ink">{style.plural}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-ink-faint">{counts?.[c] ?? 0}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 border-t border-line pt-2 font-mono text-[10px] text-ink-faint">
        {total} visible nodes
      </div>
    </section>
  );
}
