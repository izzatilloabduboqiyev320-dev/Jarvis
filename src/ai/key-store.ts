import "server-only";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { JARVIS_HOME, KEYS_FILE, loadSavedKeys } from "@/server/home";

/**
 * Saves API keys into ~/.jarvis/keys.env (private to this user, outside the
 * project folder so updates keep it) and activates them in the running server.
 * Keys are never returned to the browser; only a masked hint is.
 */


export type KeyName = "ANTHROPIC_API_KEY" | "GEMINI_API_KEY";

export function keyHint(name: KeyName): string | null {
  loadSavedKeys();
  const key = process.env[name]?.trim();
  return key ? `${key.slice(0, name === "ANTHROPIC_API_KEY" ? 7 : 4)}…${key.slice(-4)}` : null;
}

async function readEnvFile(): Promise<string[]> {
  try {
    return (await readFile(KEYS_FILE, "utf8")).split(/\r?\n/);
  } catch {
    return [];
  }
}

/** Writes (or with null, removes) one key line, keeping every other line as it was. */
export async function saveKey(name: KeyName, key: string | null): Promise<void> {
  const lines = (await readEnvFile()).filter((l) => !new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (key) lines.unshift(`${name}=${key}`);
  await mkdir(JARVIS_HOME, { recursive: true, mode: 0o700 });
  await writeFile(KEYS_FILE, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  await chmod(KEYS_FILE, 0o600).catch(() => {});
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
