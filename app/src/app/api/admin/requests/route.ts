import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { addDays, calendarRange, todayInBookingZone } from "@/lib/date-range";
import { listPendingRequests } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const denied = adminGuard(request);
  if (denied) return denied;
  try {
    const from = todayInBookingZone();
    const range = calendarRange(from, addDays(from, 365), 367);
    return NextResponse.json({ requests: await listPendingRequests(range.timeMin, range.timeMax) });
  } catch {
    return NextResponse.json({ error: "Impossibile caricare le richieste" }, { status: 502 });
  }
}
