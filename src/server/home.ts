import "server-only";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * JARVIS keeps personal data and saved API keys OUTSIDE the project folder
 * (~/.jarvis by default), so updating or reinstalling JARVIS never deletes them.
 */
export const JARVIS_HOME = process.env.JARVIS_HOME?.trim() || path.join(os.homedir(), ".jarvis");
export const KEYS_FILE = path.join(JARVIS_HOME, "keys.env");

let loaded = false;

/** Loads keys saved from Settings into process.env (once). Keys set in .env.local or the shell win. */
export function loadSavedKeys() {
  if (loaded) return;
  loaded = true;
  try {
    for (const line of readFileSync(KEYS_FILE, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no saved keys yet */
  }
}
