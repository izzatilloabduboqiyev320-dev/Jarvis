"use client";

import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/format";
import { useJarvis, type ActivityKind } from "@/lib/store";

const KIND_COLOR: Record<ActivityKind, string> = {
  user: "text-ink",
  search: "text-accent/80",
  result: "text-accent/80",
  tool: "text-amber-300/80",
  ai: "text-emerald-300/80",
  memory: "text-fuchsia-300/80",
  error: "text-rose-400",
  system: "text-ink-faint",
};

export default function ActivityStream() {
  const activity = useJarvis((s) => s.activity);
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [activity]);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[330px]" data-testid="activity-stream">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 pb-1 font-mono text-[9.5px] uppercase tracking-[0.22em] text-accent/80 hover:text-accent"
      >
        <span className="h-px w-3 bg-accent/60" />
        Activity
        <span className="text-ink-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div ref={ref} className="max-h-[132px] space-y-[3px] overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,transparent,black_18%)]">
          {activity.slice(-40).map((a) => (
            <div key={a.id} className="flex gap-2 font-mono text-[10.5px] leading-snug">
              <span className="shrink-0 text-ink-faint/70">{clock(a.ts)}</span>
              <span className={`${KIND_COLOR[a.kind]} min-w-0 break-words`}>{a.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
