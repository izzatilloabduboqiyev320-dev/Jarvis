/**
 * Test setup: a throwaway JARVIS_HOME, so tests never touch real data in ~/.jarvis,
 * and no real API keys.
 */
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.JARVIS_HOME = mkdtempSync(path.join(os.tmpdir(), "jarvis-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GEMINI_API_KEY;

/** Forgets the in-memory caches, as if the app had restarted (files on disk stay). */
export function restart() {
  for (const k of Object.keys(globalThis)) if (k.startsWith("__jarvis_")) delete (globalThis as Record<string, unknown>)[k];
}
