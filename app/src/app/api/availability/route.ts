import { NextRequest, NextResponse } from "next/server";
import { dateBounds, overlaps, slotsForDate } from "@/lib/booking";
import { busyRanges, googleEnabled } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || "";
  const bounds = dateBounds();
  const candidates = slotsForDate(date);
  if (date < bounds.min || date > bounds.max || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Data non valida", ...bounds }, { status: 400 });
  }
  if (!candidates.length) return NextResponse.json({ date, slots: [], mode: googleEnabled ? "google" : "stub" });

  const busy = await busyRanges(candidates[0].start, candidates.at(-1)!.end);
  const slots = candidates.filter((slot) => !overlaps(slot.start, slot.end, busy));
  return NextResponse.json({ date, slots, mode: googleEnabled ? "google" : "stub" });
}
