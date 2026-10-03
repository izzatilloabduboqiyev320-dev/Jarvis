export function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-accent/90">
        <span className="h-px w-3 bg-accent/60" />
        {children}
      </h3>
      {right}
    </div>
  );
}

export function Dot({ color, size = 8, className = "" }: { color: string; size?: number; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 6px ${color}88` }}
    />
  );
}
