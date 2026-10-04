import "server-only";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Computer control (macOS). A short, fixed list of actions, each mapped to one
 * fixed command with validated arguments; nothing is ever run through a shell
 * and no text from a prompt becomes a command. Every action is approved by the
 * user first (see approvals.ts). Set JARVIS_FAKE_COMPUTER=1 to log instead of run.
 */

const run = promisify(execFile);

export type ComputerAction =
  | { kind: "open_app"; app: string }
  | { kind: "open_website"; url: string }
  | { kind: "set_volume"; level: number }
  | { kind: "screenshot" };

const APP_NAME = /^[\p{L}\p{N} .&'+-]{1,60}$/u;

/** Validates raw tool input. Throws a readable error for anything unsafe. */
export function parseAction(name: string, input: Record<string, unknown>): ComputerAction {
  switch (name) {
    case "open_app": {
      const app = String(input.app ?? "").trim();
      if (!APP_NAME.test(app) || app.startsWith(".") || app.includes("..")) throw new Error("Invalid application name");
      return { kind: "open_app", app };
    }
    case "open_website": {
      let url: URL;
      try {
        url = new URL(String(input.url ?? "").trim());
      } catch {
        throw new Error("Invalid web address");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) web addresses can be opened");
      if (url.username || url.password) throw new Error("Web addresses with passwords are not allowed");
      return { kind: "open_website", url: url.toString().slice(0, 2000) };
    }
    case "set_volume": {
      const level = Math.round(Number(input.level));
      if (!Number.isFinite(level) || level < 0 || level > 100) throw new Error("Volume must be 0–100");
      return { kind: "set_volume", level };
    }
    case "take_screenshot":
      return { kind: "screenshot" };
    default:
      throw new Error(`Unknown computer action ${name}`);
  }
}

/** What the approval card says, in Uzbek. */
export function describe(a: ComputerAction): string {
  switch (a.kind) {
    case "open_app":
      return `“${a.app}” ilovasini ochish`;
    case "open_website": {
      const u = new URL(a.url);
      return `Brauzerda ochish: ${u.host}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}${u.search ? "…" : ""}`;
    }
    case "set_volume":
      return `Ovoz balandligini ${a.level}% qilish`;
    case "screenshot":
      return "Ekranni rasmga olish (Ish stoliga saqlanadi)";
  }
}

const fake = () => process.env.JARVIS_FAKE_COMPUTER === "1";

/** Runs an approved action. Returns a short result for the AI. */
export async function perform(a: ComputerAction): Promise<string> {
  if (fake()) {
    console.info(`[jarvis computer] (fake) ${JSON.stringify(a)}`);
    return a.kind === "screenshot" ? "Screenshot saved to Desktop (fake)" : "Done (fake)";
  }
  if (process.platform !== "darwin") throw new Error("Computer control works on macOS only for now");
  const opts = { timeout: 15_000 };
  switch (a.kind) {
    case "open_app":
      try {
        await run("open", ["-a", a.app], opts);
      } catch {
        throw new Error(`Application "${a.app}" was not found on this Mac`);
      }
      return `Opened ${a.app}`;
    case "open_website":
      await run("open", [a.url], opts);
      return `Opened ${a.url}`;
    case "set_volume":
      // The level is a validated integer; the script text is fixed.
      await run("osascript", ["-e", `set volume output volume ${a.level}`], opts);
      return `Volume set to ${a.level}%`;
    case "screenshot": {
      const dir = path.join(os.homedir(), "Desktop");
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `JARVIS ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.png`);
      await run("screencapture", ["-x", file], opts);
      return `Screenshot saved to the Desktop as ${path.basename(file)}`;
    }
  }
}
