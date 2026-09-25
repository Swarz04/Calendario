import { NextRequest, NextResponse } from "next/server";
import { overlaps, slotsForDate } from "@/lib/booking";
import { busyRanges, createBooking, googleEnabled } from "@/lib/google-calendar";
import { mutationOriginIsValid, requestIp } from "@/lib/admin-server";
import { allowPublicBooking } from "@/lib/public-booking-limit";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const locks = new Set<string>();
const topics = new Set(["Sito web", "Ripetizioni", "Supporto tecnico", "Progetto digitale", "Altro"]);

export async function POST(request: NextRequest) {
  if (!mutationOriginIsValid(request)) return NextResponse.json({ error: "Origine richiesta non valida" }, { status: 403 });
  if (!allowPublicBooking(requestIp(request))) return NextResponse.json({ error: "Troppe richieste. Riprova più tardi." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });

  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const topic = typeof data.topic === "string" ? data.topic.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const date = typeof data.date === "string" ? data.date : "";
  const start = typeof data.start === "string" ? data.start : "";

  if (name.length < 2 || name.length > 80 || !emailPattern.test(email) || email.length > 160 || !topics.has(topic) || message.length > 500) {
    return NextResponse.json({ error: "Controlla nome, email e motivo" }, { status: 400 });
  }

  const selected = slotsForDate(date).find((slot) => slot.start === start);
  if (!selected) return NextResponse.json({ error: "Slot non valido o non più prenotabile" }, { status: 400 });
  if (locks.has(start)) return NextResponse.json({ error: "Slot in fase di prenotazione" }, { status: 409 });
  if (process.env.NODE_ENV === "production" && (!googleEnabled || !process.env.GOOGLE_REQUESTS_CALENDAR_ID)) {
    return NextResponse.json({ error: "Prenotazioni temporaneamente non disponibili" }, { status: 503 });
  }

  locks.add(start);
  try {
    const busy = await busyRanges(selected.start, selected.end);
    if (overlaps(selected.start, selected.end, busy)) return NextResponse.json({ error: "Slot appena occupato: scegline un altro" }, { status: 409 });
    const requestRecord = await createBooking({ name, email, topic, message, start: selected.start, end: selected.end });
    return NextResponse.json({ ok: true, id: requestRecord.id, status: requestRecord.status }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Richiesta non disponibile in questo momento" }, { status: 502 });
  } finally {
    locks.delete(start);
  }
}
