import { isLocalRequest } from "@/ai/key-store";
import { decide } from "@/server/approvals";

/** POST {id, approved} — the "Ha" / "Yo'q" buttons. Only from this computer, with the app's header. */
export async function POST(request: Request) {
  if (!isLocalRequest(request) || request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; approved?: unknown };
  if (typeof b.id !== "string" || typeof b.approved !== "boolean") return Response.json({ ok: false }, { status: 400 });
  return decide(b.id, b.approved) ? Response.json({ ok: true }) : Response.json({ ok: false, message: "Bu so'rov eskirgan" }, { status: 404 });
}
