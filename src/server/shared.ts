import "server-only";

/**
 * Server state that must be ONE copy per process. Next.js can load a module
 * more than once (each route and instrumentation.ts get their own bundle, and
 * dev reloads re-run modules), so in-memory caches live on globalThis.
 */
export function shared<T>(key: string, init: () => T): T {
  const g = globalThis as unknown as Record<string, T | undefined>;
  const k = `__jarvis_${key}`;
  return (g[k] ??= init());
}
