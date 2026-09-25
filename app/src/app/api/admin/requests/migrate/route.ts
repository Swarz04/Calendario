import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { migrateLegacyBookingRequests } from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  const denied = adminGuard(request, true);
  if (denied) return denied;
  if (process.env.NODE_ENV === "production" && !process.env.GOOGLE_REQUESTS_CALENDAR_ID) {
    return NextResponse.json({ error: "Calendario richieste non configurato" }, { status: 503 });
  }
  try {
    return NextResponse.json(await migrateLegacyBookingRequests());
  } catch {
    return NextResponse.json({ error: "Migrazione richieste non completata; i record originali sono stati conservati" }, { status: 502 });
  }
}
