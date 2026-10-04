import { isLocalRequest } from "@/ai/key-store";
import { checkBots } from "@/server/telegram";
import { withGraph } from "@/server/bots";

/** POST: checks every connected bot (read-only Telegram calls) and returns fresh statuses. */
export async function POST(request: Request) {
  if (!isLocalRequest(request) || request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false }, { status: 403 });
  return Response.json(await withGraph(await checkBots()));
}
