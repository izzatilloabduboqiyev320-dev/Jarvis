"use client";

import dynamic from "next/dynamic";
import FilterPanel from "@/components/filters/FilterPanel";
import GraphToolbar from "@/components/graph/GraphToolbar";
import JarvisHud from "@/components/hud/JarvisHud";
import Inspector from "@/components/inspector/Inspector";
import TopHubs from "@/components/inspector/TopHubs";
import ActivityStream from "@/components/jarvis/ActivityStream";
import { useJarvis } from "@/lib/store";

// WebGL renderer: client-only and code-split so the shell paints instantly.
const KnowledgeGraph = dynamic(() => import("@/components/graph/KnowledgeGraph"), {
  ssr: false,
  loading: () => <BootScreen label="Loading renderer" />,
});

function BootScreen({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border border-accent/20 border-t-accent" />
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent/80">{label}</div>
    </div>
  );
}

export default function GraphView() {
  const ready = useJarvis((s) => s.ready);
  return (
    <div className="flex h-full w-full">
      <aside className="flex w-[290px] shrink-0 flex-col gap-1 overflow-hidden border-r border-line bg-black/20">
        <header className="border-b border-line px-4 py-3">
          <div className="font-mono text-[13px] tracking-[0.42em] text-ink">J.A.R.V.I.S.</div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Knowledge Operating System</div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-[1.4] flex-col overflow-hidden">
            <Inspector />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            <TopHubs />
          </div>
        </div>
      </aside>

      <section className="graph-stage relative min-w-0 flex-1 overflow-hidden" data-testid="graph-stage">
        {ready ? <KnowledgeGraph /> : <BootScreen label="Initialising knowledge graph" />}
        <GraphToolbar />
        <ActivityStream />
      </section>

      <aside className="flex w-[250px] shrink-0 flex-col border-l border-line bg-black/20">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FilterPanel />
        </div>
        <div className="border-t border-line px-3 pb-3 pt-2">
          <JarvisHud />
        </div>
      </aside>
    </div>
  );
}
