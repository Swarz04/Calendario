"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Slot = { start: string; end: string; label: string };
type Day = { iso: string; day: string; weekday: string; month: string; isToday: boolean; isWeekend: boolean };
type Errors = Partial<Record<"name" | "email" | "topic" | "slot", string>>;

const topics = ["Sito web", "Ripetizioni", "Supporto tecnico", "Progetto digitale", "Altro"];

function isoInRome(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function dayInfo(offset: number): Day {
  const iso = isoInRome(offset);
  const date = new Date(`${iso}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekdayIndex = date.getUTCDay();
  return { iso, day: get("day"), weekday: get("weekday"), month: get("month"), isToday: offset === 0, isWeekend: weekdayIndex === 0 || weekdayIndex === 6 };
}

function longDate(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${iso}T12:00:00Z`));
}

export default function Home() {
  const days = useMemo(() => Array.from({ length: 30 }, (_, index) => dayInfo(index)), []);
  const firstOpenDay = useMemo(() => days.find((day) => !day.isWeekend)?.iso || days[0].iso, [days]);
  const [date, setDate] = useState(firstOpenDay);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{ date: string; slot: string; name: string; topic: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", topic: "", message: "" });
  const selectedSlot = slots.find((slot) => slot.start === selected);

  async function loadSlots(value: string) {
    setLoading(true);
    setSelected("");
    setErrors((current) => ({ ...current, slot: undefined }));
    setNotice("");
    try {
      const response = await fetch(`/api/availability?date=${encodeURIComponent(value)}`, { cache: "no-store" });
      const data = await response.json();
      setSlots(response.ok ? data.slots : []);
      if (!response.ok) setNotice(data.error || "Impossibile caricare gli orari.");
    } catch {
      setSlots([]);
      setNotice("Errore rete: gli orari demo non sono disponibili in questo momento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSlots(date); }, [date]);

  function validate() {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = "Inserisci almeno 2 caratteri.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Inserisci una email valida.";
    if (!form.topic.trim()) next.topic = "Scegli un motivo.";
    if (!selected) next.slot = "Scegli prima un orario.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmation(null);
    if (!validate() || !selectedSlot) return;
    setSending(true);
    setNotice("");
    const reason = [form.topic.trim(), form.message.trim()].filter(Boolean).join(" — ");
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, start: selected, name: form.name, email: form.email, reason }),
    });
    const data = await response.json();
    if (response.ok) {
      setConfirmation({ date: longDate(date), slot: selectedSlot.label, name: form.name.trim(), topic: form.topic.trim() });
      await loadSlots(date);
    } else {
      setNotice(data.error || "Invio non riuscito. Riprova o contattami direttamente.");
    }
    setSending(false);
  }

  return (
    <main>
      <header className="site-header">
        <a href="https://swarz.it">← Torna a swarz.it</a>
        <p>Antonio Scharmuller</p>
        <span>Demo / stub</span>
      </header>

      <section className="hero">
        <p className="eyebrow">Calendario booking</p>
        <h1>Calendario demo</h1>
        <p>Scegli un giorno tra i prossimi 30. Il sistema è in fase di attivazione: la richiesta non è ancora una prenotazione definitiva.</p>
        <div className="trust-row" aria-label="Stato calendario">
          <span>Demo / stub</span>
          <span>Dati non persistenti</span>
          <span>Conferma manuale</span>
        </div>
      </section>

      <section className="booking-panel" aria-label="Richiesta calendario">
        <div className="steps" aria-label="Passaggi">
          <span className="active">1. Giorno</span>
          <span className={selected ? "active" : ""}>2. Orario</span>
          <span className={selected ? "active" : ""}>3. Dati</span>
        </div>

        <div className="booking-grid">
          <section className="calendar-side" aria-labelledby="day-title">
            <div className="section-title">
              <div>
                <p className="eyebrow">Prossimi 30 giorni</p>
                <h2 id="day-title">Scegli il giorno</h2>
              </div>
              <p>Gli stati sono demo: la disponibilità reale sarà collegata a Google Calendar più avanti.</p>
            </div>
            <div className="day-grid" role="list">
              {days.map((day) => (
                <button
                  type="button"
                  key={day.iso}
                  className={`${date === day.iso ? "selected" : ""} ${day.isWeekend ? "disabled" : ""}`}
                  onClick={() => !day.isWeekend && setDate(day.iso)}
                  disabled={day.isWeekend}
                  aria-pressed={date === day.iso}
                  aria-label={`${day.weekday} ${day.day} ${day.month}${day.isToday ? ", oggi" : ""}${day.isWeekend ? ", non disponibile in demo" : ""}`}
                >
                  <span>{day.weekday}</span>
                  <strong>{day.day}</strong>
                  <small>{day.month}{day.isToday ? " · oggi" : ""}</small>
                </button>
              ))}
            </div>
            <div className="legend" aria-label="Legenda">
              <span><i /> Selezionato</span>
              <span><i /> Giorno demo</span>
              <span><i /> Non disponibile</span>
            </div>
          </section>

          <section className="form-side" aria-labelledby="slot-title">
            <form onSubmit={submit} noValidate>
              <fieldset>
                <legend id="slot-title">Scegli l’orario</legend>
                <p className="hint">{longDate(date)} · slot demo da 60 minuti · Europe/Rome</p>
                <div className="slots" aria-live="polite">
                  {loading && <p className="inline-state">Caricamento orari…</p>}
                  {!loading && slots.map((slot) => (
                    <button type="button" key={slot.start} className={selected === slot.start ? "selected" : ""} onClick={() => setSelected(slot.start)} aria-pressed={selected === slot.start}>
                      {slot.label}
                    </button>
                  ))}
                  {!loading && !slots.length && <p className="inline-state">Nessuno slot demo per questa giornata.</p>}
                </div>
                {errors.slot && <p className="field-error">{errors.slot}</p>}
                {selectedSlot && <p className="summary">Riepilogo: {longDate(date)} · {selectedSlot.label}</p>}
                <button className="text-button" type="button" onClick={() => setSelected("")} disabled={!selected}>Cambia orario</button>
              </fieldset>

              <div className="details">
                <div className="field">
                  <label htmlFor="name">Nome</label>
                  <input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" maxLength={80} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} />
                  {errors.name && <p className="field-error" id="name-error">{errors.name}</p>}
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" maxLength={160} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
                  {errors.email && <p className="field-error" id="email-error">{errors.email}</p>}
                </div>
                <div className="field">
                  <label htmlFor="topic">Motivo</label>
                  <select id="topic" value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} aria-invalid={Boolean(errors.topic)} aria-describedby={errors.topic ? "topic-error" : undefined}>
                    <option value="">Scegli un motivo</option>
                    {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                  </select>
                  {errors.topic && <p className="field-error" id="topic-error">{errors.topic}</p>}
                </div>
                <div className="field full">
                  <label htmlFor="message">Messaggio facoltativo</label>
                  <textarea id="message" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} maxLength={500} placeholder="Due righe bastano. Non inserire dati sensibili." />
                </div>
              </div>

              <div className="submit-row">
                <p>Modalità demo: nessuna promessa di prenotazione definitiva, nessuna email automatica reale finché OAuth non è collegato.</p>
                <button className="submit" disabled={sending || loading}>{sending ? "Invio in corso…" : "Invia richiesta"}</button>
              </div>
              {notice && <p className="message warn" role="status" aria-live="polite">{notice}</p>}
              {confirmation && (
                <div className="confirmation" role="status" aria-live="polite">
                  <h2>Richiesta inviata.</h2>
                  <p>Non è ancora una prenotazione confermata.</p>
                  <dl>
                    <div><dt>Nome</dt><dd>{confirmation.name}</dd></div>
                    <div><dt>Quando</dt><dd>{confirmation.date} · {confirmation.slot}</dd></div>
                    <div><dt>Motivo</dt><dd>{confirmation.topic}</dd></div>
                  </dl>
                </div>
              )}
            </form>
          </section>
        </div>
      </section>

      <footer>
        <span>© {new Date().getFullYear()} Antonio Scharmuller</span>
        <span>Questo calendario fa parte del portfolio tecnico su swarz.it.</span>
      </footer>
    </main>
  );
}
