import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { resolveBookingRequest } from "@/lib/google-calendar";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const denied = adminGuard(request, true);
  if (denied) return denied;
  try {
    const data = await request.json() as { action?: unknown };
    if (data.action !== "accept" && data.action !== "reject") {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }
    const { id } = await context.params;
    return NextResponse.json(await resolveBookingRequest(id, data.action));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Richiesta non disponibile" }, { status: 400 });
  }
}
