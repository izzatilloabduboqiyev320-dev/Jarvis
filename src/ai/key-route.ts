import "server-only";
import { isLocalRequest, keyHint, saveKey, type KeyName } from "@/ai/key-store";

/**
 * Shared handlers for the Settings "paste your API key" routes.
 * GET → {configured, hint}; POST {key} → verify, save, activate; DELETE → remove.
 * Only accepted from this computer and with the app's own header (blocks other websites).
 */

export type Verify = (key: string) => Promise<"ok" | "invalid" | "unverified">;

interface Options {
  name: KeyName;
  pattern: RegExp;
  formatMessage: string;
  invalidMessage: string;
  verify: Verify;
  onChange?: () => void;
}

function guard(request: Request): Response | null {
  if (!isLocalRequest(request)) {
    return Response.json({ ok: false, message: "API keys can only be changed on the computer running JARVIS." }, { status: 403 });
  }
  if (request.method !== "GET" && request.headers.get("x-jarvis-local") !== "1") {
    return Response.json({ ok: false, message: "Missing app header." }, { status: 403 });
  }
  return null;
}

export function keyRoute(o: Options) {
  return {
    GET(request: Request) {
      const denied = guard(request);
      if (denied) return denied;
      const hint = keyHint(o.name);
      return Response.json({ configured: Boolean(hint), hint });
    },

    async POST(request: Request) {
      const denied = guard(request);
      if (denied) return denied;
      let key = "";
      try {
        const body = (await request.json()) as { key?: unknown };
        key = typeof body.key === "string" ? body.key.trim() : "";
      } catch {
        /* invalid JSON */
      }
      if (!o.pattern.test(key)) return Response.json({ ok: false, code: "format", message: o.formatMessage }, { status: 400 });

      const result = await o.verify(key).catch(() => "unverified" as const);
      if (result === "invalid") return Response.json({ ok: false, code: "invalid", message: o.invalidMessage }, { status: 400 });

      try {
        await saveKey(o.name, key);
      } catch (err) {
        console.error("[settings key]", err instanceof Error ? err.message : err);
        return Response.json({ ok: false, code: "write", message: "Could not write the .env.local file." }, { status: 500 });
      }
      o.onChange?.();
      return Response.json({ ok: true, verified: result === "ok", hint: keyHint(o.name) });
    },

    async DELETE(request: Request) {
      const denied = guard(request);
      if (denied) return denied;
      try {
        await saveKey(o.name, null);
      } catch {
        return Response.json({ ok: false, code: "write", message: "Could not write the .env.local file." }, { status: 500 });
      }
      o.onChange?.();
      return Response.json({ ok: true });
    },
  };
}
