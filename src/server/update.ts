import "server-only";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { JARVIS_HOME } from "@/server/home";

/**
 * One-button updates: downloads the newest JARVIS from its public GitHub
 * repository, replaces the program files, keeps everything personal, then
 * restarts (scripts/run.mjs restarts on exit code 75).
 *
 * Kept on update: node_modules, .next, .env* files. Personal data and keys
 * live in ~/.jarvis, outside this folder, so updates never touch them.
 * Only fixed commands run (unzip here, npm install in run.mjs); nothing comes from user input.
 */

const run = promisify(execFile);
const ROOT = process.cwd();
const VERSION_FILE = path.join(ROOT, ".jarvis-version");
export const RESTART_CODE = 75;

const api = () => (process.env.JARVIS_UPDATE_API?.trim() || "https://api.github.com").replace(/\/+$/, "");
const codeload = () => (process.env.JARVIS_UPDATE_CODELOAD?.trim() || "https://codeload.github.com").replace(/\/+$/, "");

async function repo(): Promise<string | null> {
  const fromEnv = process.env.JARVIS_UPDATE_REPO?.trim();
  if (fromEnv) return fromEnv;
  try {
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as { jarvisUpdateRepo?: string };
    return pkg.jarvisUpdateRepo?.trim() || null;
  } catch {
    return null;
  }
}

const validRepo = (r: string) => /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(r);

async function currentVersion(): Promise<string | null> {
  try {
    return (await readFile(VERSION_FILE, "utf8")).trim() || null;
  } catch {
    return null;
  }
}

export interface UpdateInfo {
  configured: boolean;
  current: string | null;
  latest?: string;
  message?: string;
  date?: string;
  available: boolean;
  error?: string;
}

export async function checkUpdate(): Promise<UpdateInfo> {
  const r = await repo();
  const current = await currentVersion();
  if (!r || !validRepo(r)) return { configured: false, current, available: false };
  try {
    const res = await fetch(`${api()}/repos/${r}/commits/main`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "jarvis-updater" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { configured: true, current, available: false, error: `GitHub ${res.status}` };
    const j = (await res.json()) as { sha: string; commit?: { message?: string; committer?: { date?: string } } };
    return {
      configured: true,
      current,
      latest: j.sha,
      message: j.commit?.message?.split("\n")[0]?.slice(0, 140),
      date: j.commit?.committer?.date,
      available: j.sha !== current,
    };
  } catch {
    return { configured: true, current, available: false, error: "Internetga ulanib bo'lmadi" };
  }
}

let updating = false;

/**
 * Downloads the newest version and stages it in ~/.jarvis/update. The swap
 * happens in scripts/run.mjs after the server stops (files can't be replaced
 * safely while Next.js is running from them).
 */
export async function applyUpdate(): Promise<{ ok: boolean; message: string; restart?: boolean }> {
  if (updating) return { ok: false, message: "Yangilanish allaqachon ketyapti" };
  const info = await checkUpdate();
  if (!info.configured || !info.latest) return { ok: false, message: info.error ?? "Yangilash manzili sozlanmagan" };
  if (!info.available) return { ok: true, message: "JARVIS allaqachon eng yangi" };
  if (!/^[0-9a-f]{40}$/.test(info.latest)) return { ok: false, message: "GitHub javobi noto'g'ri" };
  const r = (await repo())!;
  updating = true;
  const stage = path.join(JARVIS_HOME, "update");
  const tmp = path.join(stage, `dl-${Date.now()}`);
  try {
    await mkdir(tmp, { recursive: true });
    const res = await fetch(`${codeload()}/${r}/zip/${info.latest}`, { signal: AbortSignal.timeout(120_000), headers: { "User-Agent": "jarvis-updater" } });
    if (!res.ok) throw new Error(`Yuklab bo'lmadi (GitHub ${res.status})`);
    const zip = path.join(tmp, "jarvis.zip");
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
    const out = path.join(tmp, "x");
    await mkdir(out);
    await run("unzip", ["-q", zip, "-d", out], { timeout: 120_000 });
    const [top] = await readdir(out);
    const dir = path.join(out, top ?? "");
    // Sanity: it must be JARVIS before anything is replaced.
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as { name?: string };
    if (pkg.name !== "jarvis") throw new Error("Yuklangan fayl JARVIS emas");
    await rm(zip, { force: true });
    await writeFile(path.join(stage, "pending.json"), JSON.stringify({ sha: info.latest, dir: path.join(out, top!) }));
    console.info(`[jarvis update] staged ${info.latest.slice(0, 7)}; restarting to install`);
    return { ok: true, message: "Yuklab olindi. JARVIS o'rnatib, qayta ishga tushyapti…", restart: true };
  } catch (err) {
    console.error("[jarvis update]", err instanceof Error ? err.message : err);
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    return { ok: false, message: err instanceof Error ? err.message : "Yangilab bo'lmadi" };
  } finally {
    updating = false;
  }
}
