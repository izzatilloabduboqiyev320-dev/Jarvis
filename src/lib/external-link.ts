import type { KGNode, NodeCategory } from "@/types/graph";

/**
 * One secure way to open external resources (YouTube videos, websites, docs,
 * articles, courses). JARVIS runs as a web app in the browser, so a resource
 * opens in a new tab; only http(s) links are ever opened.
 */

/** Categories that point at something outside JARVIS; they say so when their link is missing. */
export const RESOURCE_CATEGORIES: readonly NodeCategory[] = ["video", "web", "book"];

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** Parses a link and returns it only if it is a safe http(s) address (no javascript:, data:, file:, no passwords). */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol) || !url.hostname || url.username || url.password) return null;
  // Keep the link exactly as given (YouTube video ids, playlists and timestamps stay intact).
  return text;
}

export function isSafeExternalUrl(raw: unknown): boolean {
  return safeExternalUrl(raw) !== null;
}

/** The node's own link (its canonical `url` field), if it is safe to open. */
export function resourceUrl(node: Pick<KGNode, "url"> | null | undefined): string | null {
  return safeExternalUrl(node?.url);
}

/** "YouTube", "docs.anthropic.com"… for button labels. */
export function sourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "YouTube";
    return host;
  } catch {
    return "";
  }
}

/** Host + path only: query strings and fragments can carry tokens, so logs never include them. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return "";
  }
}

export type OpenResult = { ok: true; url: string } | { ok: false; reason: "missing" | "unsafe" | "failed"; message: string };

type Opener = (url: string, target: string, features: string) => unknown;

/**
 * Opens a link in a new browser tab without giving the new page access to JARVIS.
 * Never throws: failures come back as a result so the UI can show a small message.
 */
export function openExternalUrl(raw: unknown, open?: Opener): OpenResult {
  if (raw === undefined || raw === null || raw === "") return { ok: false, reason: "missing", message: "External link unavailable" };
  const url = safeExternalUrl(raw);
  if (!url) return { ok: false, reason: "unsafe", message: "This link is not a safe web address" };
  try {
    const fn = open ?? (typeof window !== "undefined" ? window.open.bind(window) : null);
    if (!fn) throw new Error("No browser window to open the link in");
    // With "noopener" the browser returns null even on success, so only an exception means failure.
    fn(url, "_blank", "noopener,noreferrer");
    return { ok: true, url };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("[RESOURCE] open failed", err);
    return { ok: false, reason: "failed", message: "Could not open this resource." };
  }
}

/** In development, says which resource has no link (instead of inventing one). */
export function warnMissingUrl(node: Pick<KGNode, "label" | "category" | "url">) {
  if (process.env.NODE_ENV !== "production" && RESOURCE_CATEGORIES.includes(node.category) && !node.url) {
    console.warn(`[RESOURCE] Missing URL for node: ${node.label}`);
  }
}
