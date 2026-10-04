import { isLocalRequest } from "@/ai/key-store";
import { applyUpdate, checkUpdate, RESTART_CODE } from "@/server/update";

/** GET: is a newer JARVIS available? POST: install it and restart. Local only. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ ok: false }, { status: 403 });
  return Response.json(await checkUpdate());
}

export async function POST(request: Request) {
  if (!isLocalRequest(request) || request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false }, { status: 403 });
  const result = await applyUpdate();
  // Restart after the reply is sent; scripts/run.mjs starts JARVIS again.
  if (result.restart) setTimeout(() => process.exit(RESTART_CODE), 800);
  return Response.json(result);
}
