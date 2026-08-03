import { NextResponse } from "next/server";
import { overlaps, slotsForDate } from "@/lib/booking";
import { busyRanges, createBooking } from "@/lib/google-calendar";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const locks = new Set<string>();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });

  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  const date = typeof data.date === "string" ? data.date : "";
  const start = typeof data.start === "string" ? data.start : "";

  if (name.length < 2 || name.length > 80 || !emailPattern.test(email) || email.length > 160 || reason.length < 3 || reason.length > 500) {
    return NextResponse.json({ error: "Controlla nome, email e motivo" }, { status: 400 });
  }

  const selected = slotsForDate(date).find((slot) => slot.start === start);
  if (!selected) return NextResponse.json({ error: "Slot non valido o non più prenotabile" }, { status: 400 });
  if (locks.has(start)) return NextResponse.json({ error: "Slot in fase di prenotazione" }, { status: 409 });

  locks.add(start);
  try {
    const busy = await busyRanges(selected.start, selected.end);
    if (overlaps(selected.start, selected.end, busy)) return NextResponse.json({ error: "Slot appena occupato: scegline un altro" }, { status: 409 });
    const event = await createBooking({ name, email, reason, start: selected.start, end: selected.end });
    return NextResponse.json({ ok: true, event });
  } catch {
    return NextResponse.json({ error: "Prenotazione non disponibile in questo momento" }, { status: 502 });
  } finally {
    locks.delete(start);
  }
}
