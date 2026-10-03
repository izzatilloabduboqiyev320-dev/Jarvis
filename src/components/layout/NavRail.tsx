"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useJarvis } from "@/lib/store";

const ICONS: Record<string, React.ReactNode> = {
  graph: (
    <>
      <circle cx="5" cy="6" r="2" /><circle cx="15" cy="5" r="1.6" /><circle cx="13" cy="15" r="2.4" /><circle cx="4" cy="15" r="1.4" />
      <path d="M6.8 6.6l4.6 7M7 6l6.4-.8M5.2 8v5.6M14.6 6.6l-1 6" />
    </>
  ),
  chat: <path d="M3 4h14v9H8l-4 3v-3H3z" />,
  memory: (
    <>
      <ellipse cx="10" cy="5" rx="6" ry="2.2" /><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2" />
    </>
  ),
  files: <path d="M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15M7.5 10h5M7.5 13h5" />,
  agents: (
    <>
      <rect x="4" y="6" width="12" height="9" rx="1" /><path d="M10 3v3M7.5 10h.01M12.5 10h.01M8 13h4" />
    </>
  ),
  skills: <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z" />,
  tasks: <path d="M4 5.5l1.5 1.5L8 4.5M10.5 6h6M4 11l1.5 1.5L8 10M10.5 11.5h6M10.5 16h6M4.5 16h2" />,
  settings: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
    </>
  ),
};

const ITEMS = [
  { href: "/graph", key: "graph", label: "Knowledge Graph" },
  { href: "/chat", key: "chat", label: "Chat" },
  { href: "/memory", key: "memory", label: "Memory" },
  { href: "/files", key: "files", label: "Files" },
  { href: "/agents", key: "agents", label: "Agents" },
  { href: "/skills", key: "skills", label: "Skills" },
  { href: "/tasks", key: "tasks", label: "Tasks" },
];

export default function NavRail() {
  const pathname = usePathname();
  const setPaletteOpen = useJarvis((s) => s.setPaletteOpen);
  const link = (href: string, key: string, label: string) => {
    const active = pathname === href || (href === "/graph" && pathname === "/");
    return (
      <Link
        key={key}
        href={href}
        title={label}
        aria-label={label}
        className={`group relative flex h-10 w-10 items-center justify-center transition ${
          active ? "text-accent" : "text-ink-faint hover:text-ink"
        }`}
      >
        {active && <span className="absolute left-[-8px] top-2 h-6 w-[2px] bg-accent shadow-[0_0_8px_var(--color-accent)]" />}
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[key]}
        </svg>
        <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap border border-line bg-[#03090d] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim opacity-0 transition group-hover:opacity-100">
          {label}
        </span>
      </Link>
    );
  };
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center border-r border-line bg-black/30 py-3">
      <button
        onClick={() => setPaletteOpen(true)}
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 text-accent shadow-[0_0_14px_rgba(80,220,240,0.25)] transition hover:border-accent"
        title="Ask JARVIS (⌘K)"
        aria-label="Ask JARVIS"
      >
        <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
      </button>
      <div className="flex flex-col gap-1">{ITEMS.map((i) => link(i.href, i.key, i.label))}</div>
      <div className="mt-auto">{link("/settings", "settings", "Settings")}</div>
    </nav>
  );
}
