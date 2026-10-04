import "server-only";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { JARVIS_HOME } from "@/server/home";
import { shared } from "@/server/shared";

/**
 * A small JSON file in ~/.jarvis, read once and cached for the process.
 * Writes are queued and atomic (temp file + rename) and owner-only, so a crash
 * never leaves half a file and other users of the Mac can't read it.
 */
export function jsonFile<T>(name: string, empty: () => T, check: (raw: unknown) => T | null) {
  const file = path.join(JARVIS_HOME, name);
  const S = shared(`file:${name}`, () => ({ data: null as T | null, writing: Promise.resolve() as Promise<void> }));
  return {
    file,
    async load(): Promise<T> {
      if (S.data) return S.data;
      const text = await readFile(file, "utf8").catch(() => null);
      try {
        S.data = text === null ? empty() : (check(JSON.parse(text)) ?? empty());
      } catch {
        // Unreadable file: keep a copy so the next save does not overwrite the user's data.
        await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => {});
        console.error(`[ERROR] DATABASE ${name} was unreadable; kept a copy next to it and started fresh`);
        S.data = empty();
      }
      return S.data;
    },
    save(): Promise<void> {
      S.writing = S.writing
        .then(async () => {
          if (!S.data) return;
          await mkdir(JARVIS_HOME, { recursive: true, mode: 0o700 });
          const tmp = `${file}.${process.pid}.tmp`;
          await writeFile(tmp, JSON.stringify(S.data), { encoding: "utf8", mode: 0o600 });
          await chmod(tmp, 0o600);
          await rename(tmp, file);
        })
        .catch((err) => console.error(`[jarvis] could not save ${name}:`, err instanceof Error ? err.message : err));
      return S.writing;
    },
  };
}
