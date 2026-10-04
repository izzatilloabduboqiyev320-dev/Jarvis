// Starts JARVIS (next dev). After an in-app update (exit code 75) it installs
// the downloaded version while the server is stopped, then starts it again.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const RESTART = 75;
const ROOT = process.cwd();
const HOME = process.env.JARVIS_HOME?.trim() || path.join(os.homedir(), ".jarvis");
const PENDING = path.join(HOME, "update", "pending.json");
// Never replaced: installed packages, build cache, local settings, version stamp.
const KEEP = (name) => ["node_modules", ".next", ".git", ".jarvis-version"].includes(name) || name.startsWith(".env");

function applyPending() {
  if (!existsSync(PENDING)) return;
  let job;
  try {
    job = JSON.parse(readFileSync(PENDING, "utf8"));
    rmSync(PENDING);
    const src = job.dir;
    if (JSON.parse(readFileSync(path.join(src, "package.json"), "utf8")).name !== "jarvis") throw new Error("not JARVIS");
    const lock = (dir) => (existsSync(path.join(dir, "package-lock.json")) ? readFileSync(path.join(dir, "package-lock.json"), "utf8") : "");
    const depsChanged = lock(ROOT) !== lock(src);
    console.log("\n  Installing the new JARVIS version…");
    for (const name of readdirSync(ROOT)) if (!KEEP(name)) rmSync(path.join(ROOT, name), { recursive: true, force: true });
    for (const name of readdirSync(src)) if (!KEEP(name)) cpSync(path.join(src, name), path.join(ROOT, name), { recursive: true });
    if (depsChanged || !existsSync(path.join(ROOT, "node_modules"))) {
      console.log("  Updating packages (npm install)…");
      spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], { cwd: ROOT, stdio: "inherit" });
    }
    writeFileSync(path.join(ROOT, ".jarvis-version"), `${job.sha}\n`);
    console.log(`  JARVIS updated to ${String(job.sha).slice(0, 7)}.\n`);
  } catch (err) {
    console.error("  Update failed:", err?.message ?? err);
  } finally {
    if (job?.dir) rmSync(job.dir, { recursive: true, force: true });
  }
}

let child;
function start() {
  applyPending();
  const next = createRequire(path.join(ROOT, "package.json")).resolve("next/dist/bin/next");
  child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (code === RESTART) start();
    else process.exit(code ?? (signal ? 1 : 0));
  });
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child?.kill(sig));
start();
