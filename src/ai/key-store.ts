import "server-only";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Saves the Claude API key into .env.local (the project's private settings file)
 * and activates it in the running server, so the user never edits files by hand.
 * The key itself is never returned to the browser; only a masked hint is.
 */

const ENV_FILE = path.join(process.cwd(), ".env.local");
const VAR = "ANTHROPIC_API_KEY";

export const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

export function keyHint(): string | null {
  const key = process.env[VAR]?.trim();
  return key ? `sk-ant-…${key.slice(-4)}` : null;
}

async function readEnvFile(): Promise<string[]> {
  try {
    return (await readFile(ENV_FILE, "utf8")).split(/\r?\n/);
  } catch {
    return [];
  }
}

/** Writes (or with null, removes) the key line, keeping every other line as it was. */
export async function saveKey(key: string | null): Promise<void> {
  const lines = (await readEnvFile()).filter((l) => !new RegExp(`^\\s*(export\\s+)?${VAR}\\s*=`).test(l));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (key) lines.unshift(`${VAR}=${key}`);
  await writeFile(ENV_FILE, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  await chmod(ENV_FILE, 0o600).catch(() => {});
  if (key) process.env[VAR] = key;
  else delete process.env[VAR];
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
