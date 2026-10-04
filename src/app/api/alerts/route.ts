import { isLocalRequest } from "@/ai/key-store";
import { cancelAlert, describeAlert, listAlerts } from "@/server/market";

/** GET → price alerts (active + recently fired); DELETE ?id= cancels one. Local only. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ ok: false }, { status: 403 });
  const alerts = (await listAlerts(true)).map((a) => ({ ...a, text: describeAlert(a) }));
  return Response.json({ ok: true, alerts });
}

export async function DELETE(request: Request) {
  if (!isLocalRequest(request) || request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return (await cancelAlert(id)) ? Response.json({ ok: true }) : Response.json({ ok: false }, { status: 404 });
}
