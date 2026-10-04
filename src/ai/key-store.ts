import "server-only";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Saves API keys into .env.local (the project's private settings file) and
 * activates them in the running server, so the user never edits files by hand.
 * Keys are never returned to the browser; only a masked hint is.
 */

const ENV_FILE = path.join(process.cwd(), ".env.local");

export type KeyName = "ANTHROPIC_API_KEY" | "GEMINI_API_KEY";

export function keyHint(name: KeyName): string | null {
  const key = process.env[name]?.trim();
  return key ? `${key.slice(0, name === "ANTHROPIC_API_KEY" ? 7 : 4)}…${key.slice(-4)}` : null;
}

async function readEnvFile(): Promise<string[]> {
  try {
    return (await readFile(ENV_FILE, "utf8")).split(/\r?\n/);
  } catch {
    return [];
  }
}

/** Writes (or with null, removes) one key line, keeping every other line as it was. */
export async function saveKey(name: KeyName, key: string | null): Promise<void> {
  const lines = (await readEnvFile()).filter((l) => !new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (key) lines.unshift(`${name}=${key}`);
  await writeFile(ENV_FILE, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  await chmod(ENV_FILE, 0o600).catch(() => {});
  if (key) process.env[name] = key;
  else delete process.env[name];
}

/** True when the request comes from this computer (the app is a local, single-user tool). */
export function isLocalRequest(request: Request): boolean {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  const local = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!local.has(host)) return false;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (!local.has(new URL(origin).hostname.toLowerCase())) return false;
    } catch {
      return false;
    }
  }
  return true;
}
