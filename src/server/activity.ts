import "server-only";
import { jsonFile } from "@/server/json-file";

/**
 * JARVIS's activity log: what the server really did for each request
 * (searches, AI calls, tools, approvals, errors). Shown in the Activity panel
 * and kept in ~/.jarvis/activity.json (the latest entries only).
 */

export type ActivityKind = "user" | "search" | "result" | "tool" | "ai" | "error" | "system" | "memory";

export interface ActivityEntry {
  ts: number;
  kind: ActivityKind;
  text: string;
  channel?: "app" | "telegram";
}

const KEEP = 500;
const KINDS: ActivityKind[] = ["user", "search", "result", "tool", "ai", "error", "system", "memory"];

const store = jsonFile<{ entries: ActivityEntry[] }>(
  "activity.json",
  () => ({ entries: [] }),
  (raw) => {
    const e = (raw as { entries?: unknown })?.entries;
    return Array.isArray(e) ? { entries: e.filter((x) => x && KINDS.includes(x.kind) && typeof x.text === "string") } : null;
  },
);

export async function logActivity(kind: ActivityKind, text: string, channel?: ActivityEntry["channel"]): Promise<ActivityEntry> {
  const entry: ActivityEntry = { ts: Date.now(), kind, text: text.slice(0, 300), ...(channel ? { channel } : {}) };
  const data = await store.load();
  data.entries.push(entry);
  if (data.entries.length > KEEP) data.entries.splice(0, data.entries.length - KEEP);
  await store.save();
  return entry;
}

export async function recentActivity(limit = 100): Promise<ActivityEntry[]> {
  return (await store.load()).entries.slice(-limit);
}
