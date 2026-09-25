import { NextRequest, NextResponse } from "next/server";
import { toPublicCalendarEvent } from "@/lib/calendar-events";
import { addDays, calendarRange, todayInBookingZone } from "@/lib/date-range";
import { googleEnabled, listCalendarEvents } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const fallbackFrom = todayInBookingZone();
    const from = request.nextUrl.searchParams.get("from") || fallbackFrom;
    const to = request.nextUrl.searchParams.get("to") || addDays(from, 29);
    const range = calendarRange(from, to);
    const events = (await listCalendarEvents(range.timeMin, range.timeMax))
      .map((event) => toPublicCalendarEvent(event))
      .filter((event) => event !== null);
    return NextResponse.json(
      { from, to, mode: googleEnabled ? "google" : "stub", events },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Intervallo calendario non valido" }, { status: 400 });
  }
}
