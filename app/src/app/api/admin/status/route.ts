import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { googleCalendarAccessStatus } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const denied = adminGuard(request);
  if (denied) return denied;
  const calendars = await googleCalendarAccessStatus();
  return NextResponse.json({
    google: calendars.primary && calendars.requests ? "connected" : "attention",
    calendars,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
