import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { calendarRange, todayInBookingZone, addDays } from "@/lib/date-range";
import { createManagedEvent, listAdminEvents } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const denied = adminGuard(request);
  if (denied) return denied;
  try {
    const from = request.nextUrl.searchParams.get("from") || todayInBookingZone();
    const to = request.nextUrl.searchParams.get("to") || addDays(from, 365);
    const range = calendarRange(from, to, 367);
    return NextResponse.json({ events: await listAdminEvents(range.timeMin, range.timeMax) });
  } catch {
    return NextResponse.json({ error: "Impossibile caricare gli eventi" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const denied = adminGuard(request, true);
  if (denied) return denied;
  try {
    return NextResponse.json({ event: await createManagedEvent(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evento non valido" }, { status: 400 });
  }
}
