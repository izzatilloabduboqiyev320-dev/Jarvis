import { isLocalRequest } from "@/ai/key-store";
import { removeItem, setTaskStatus } from "@/server/store";

/** PATCH {status: "open"|"done"} marks a saved task; DELETE removes a saved item (the UI confirms first). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  const { id } = await ctx.params;
  const b = (await request.json().catch(() => ({}))) as { status?: string };
  if (b.status !== "open" && b.status !== "done") return Response.json({ message: "status must be open or done" }, { status: 400 });
  const node = await setTaskStatus(id, b.status);
  return node ? Response.json({ node }) : Response.json({ message: "Not a saved task" }, { status: 404 });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  const { id } = await ctx.params;
  return (await removeItem(id)) ? Response.json({ ok: true }) : Response.json({ message: "Only items you created can be deleted" }, { status: 404 });
}
