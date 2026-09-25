import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { deleteManagedEvent, updateManagedEvent } from "@/lib/google-calendar";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const denied = adminGuard(request, true);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    return NextResponse.json({ event: await updateManagedEvent(id, await request.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evento non valido" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const denied = adminGuard(request, true);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    await deleteManagedEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evento non eliminabile" }, { status: 400 });
  }
}
