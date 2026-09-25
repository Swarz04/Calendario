import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { BookingConflictError, resolveBookingRequest } from "@/lib/google-calendar";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const denied = adminGuard(request, true);
  if (denied) return denied;
  try {
    const data = await request.json() as { action?: unknown; visibility?: unknown };
    if (data.action !== "accept" && data.action !== "reject") {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }
    if (data.action === "accept" && data.visibility !== "public" && data.visibility !== "private") {
      return NextResponse.json({ error: "Scegli la visibilità dell’evento" }, { status: 400 });
    }
    const { id } = await context.params;
    const result = await resolveBookingRequest(id, data.action, data.action === "accept" ? data.visibility as "public" | "private" : "private");
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof BookingConflictError ? 409 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Richiesta non disponibile" }, { status });
  }
}
