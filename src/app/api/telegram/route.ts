import { isLocalRequest } from "@/ai/key-store";
import { withGraph } from "@/server/bots";
import { addBot, listBots, removeBot } from "@/server/telegram";

/**
 * Telegram bots connected to JARVIS. GET lists them (never the tokens);
 * POST {token} verifies and adds one; DELETE ?id= removes one.
 * Only from this computer, and changes need the app's own header.
 */

function denied(request: Request, change: boolean) {
  if (!isLocalRequest(request)) return Response.json({ ok: false, message: "Faqat JARVIS ishlayotgan kompyuterdan." }, { status: 403 });
  if (change && request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false, message: "Missing app header." }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  return denied(request, false) ?? Response.json(await withGraph(await listBots()));
}

export async function POST(request: Request) {
  const d = denied(request, true);
  if (d) return d;
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  try {
    const bot = await addBot(token);
    console.info(`[jarvis telegram] added @${bot.username}`);
    return Response.json({ ...(await withGraph(await listBots())), added: bot });
  } catch (err) {
    const e = err as Error & { kind?: string };
    return Response.json({ ok: false, message: e.message }, { status: e.kind === "network" ? 502 : 400 });
  }
}

export async function DELETE(request: Request) {
  const d = denied(request, true);
  if (d) return d;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || !(await removeBot(id))) return Response.json({ ok: false, message: "Bunday bot yo'q" }, { status: 404 });
  console.info(`[jarvis telegram] removed bot ${id}`);
  return Response.json(await withGraph(await listBots()));
}
