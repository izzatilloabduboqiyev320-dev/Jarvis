import Anthropic from "@anthropic-ai/sdk";
import { resetClaudeClient } from "@/ai/claude";
import { isLocalRequest, KEY_PATTERN, keyHint, saveKey } from "@/ai/key-store";

/**
 * GET    → { configured, hint }       (never the key itself)
 * POST   { key } → verify, save to .env.local, activate immediately
 * DELETE → remove the key
 * Only accepted from this computer, and only with the app's own header (blocks other websites).
 */

function guard(request: Request): Response | null {
  if (!isLocalRequest(request)) {
    return Response.json({ ok: false, message: "API keys can only be changed on the computer running JARVIS." }, { status: 403 });
  }
  if (request.method !== "GET" && request.headers.get("x-jarvis-local") !== "1") {
    return Response.json({ ok: false, message: "Missing app header." }, { status: 403 });
  }
  return null;
}

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const hint = keyHint();
  return Response.json({ configured: Boolean(hint), hint });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  let key = "";
  try {
    const body = (await request.json()) as { key?: unknown };
    key = typeof body.key === "string" ? body.key.trim() : "";
  } catch {
    /* invalid JSON */
  }
  if (!KEY_PATTERN.test(key)) {
    return Response.json({ ok: false, code: "format", message: "This doesn't look like a Claude API key (it starts with sk-ant-)." }, { status: 400 });
  }

  // Check the key with a free call (list models) before saving it.
  let verified = true;
  try {
    await new Anthropic({ apiKey: key }).models.list({ limit: 1 });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || (err instanceof Anthropic.APIError && err.status === 401)) {
      return Response.json({ ok: false, code: "invalid", message: "Claude rejected this key. Copy it again from console.anthropic.com." }, { status: 400 });
    }
    verified = false; // offline or Anthropic unreachable: save anyway
  }

  try {
    await saveKey(key);
  } catch (err) {
    console.error("[api/settings/claude-key]", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, code: "write", message: "Could not write the .env.local file." }, { status: 500 });
  }
  resetClaudeClient();
  return Response.json({ ok: true, verified, hint: keyHint() });
}

export async function DELETE(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    await saveKey(null);
  } catch {
    return Response.json({ ok: false, code: "write", message: "Could not write the .env.local file." }, { status: 500 });
  }
  resetClaudeClient();
  return Response.json({ ok: true });
}
