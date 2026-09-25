import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { listBookingRequests } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const denied = adminGuard(request);
  if (denied) return denied;
  if (process.env.NODE_ENV === "production" && !process.env.GOOGLE_REQUESTS_CALENDAR_ID) {
    return NextResponse.json({ error: "Calendario richieste non configurato" }, { status: 503 });
  }
  try {
    return NextResponse.json(await listBookingRequests());
  } catch {
    return NextResponse.json({ error: "Impossibile caricare le richieste" }, { status: 502 });
  }
}
