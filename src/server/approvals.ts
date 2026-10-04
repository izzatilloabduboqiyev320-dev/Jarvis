import "server-only";
import { randomUUID } from "node:crypto";

/**
 * The approval system: any action that changes something outside JARVIS
 * (opening apps, sites, changing volume…) waits here until Izzatillo presses
 * "Ha" or "Yo'q" on screen. There is no bypass: no answer means no.
 */

const TIMEOUT_MS = 90_000;

interface Pending {
  summary: string;
  resolve: (ok: boolean) => void;
}
const pending = new Map<string, Pending>();

export type ApprovalEvent = { t: "approval"; id: string; summary: string } | { t: "approval-done"; id: string; approved: boolean; reason?: string };

/** Shows the request on screen and resolves true only on an explicit "Ha". */
export function requestApproval(summary: string, emit: (e: ApprovalEvent) => void, signal: AbortSignal): Promise<boolean> {
  const id = randomUUID();
  emit({ t: "approval", id, summary });
  console.info(`[jarvis approval] asked: ${summary}`);
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean, reason?: string) => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      console.info(`[jarvis approval] ${ok ? "approved" : `declined${reason ? ` (${reason})` : ""}`}: ${summary}`);
      emit({ t: "approval-done", id, approved: ok, reason });
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false, "timeout"), TIMEOUT_MS);
    const onAbort = () => finish(false, "closed");
    signal.addEventListener("abort", onAbort);
    pending.set(id, { summary, resolve: (ok) => finish(ok) });
  });
}

/** Called by POST /api/approvals. Returns false when the request no longer exists. */
export function decide(id: string, approved: boolean): boolean {
  const p = pending.get(id);
  if (!p) return false;
  p.resolve(approved);
  return true;
}
