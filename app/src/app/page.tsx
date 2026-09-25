"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Slot = { start: string; end: string; label: string };
type Day = { iso: string; day: string; weekday: string; month: string; isToday: boolean; isWeekend: boolean };
type PublicEvent = { date: string; start: string; end: string; timeLabel: string; title: string; kind: "lesson" | "meeting" | "event" | "busy"; allDay: boolean };
type Errors = Partial<Record<"name" | "email" | "topic" | "slot", string>>;
type Availability = "checking" | "available" | "full" | "error";

function availabilityFor(slots: Slot[]): Availability {
  return slots.length > 0 ? "available" : "full";
}

const topics = ["Sito web", "Ripetizioni", "Supporto tecnico", "Progetto digitale", "Altro"];
const eventLabels = { lesson: "Lezione", meeting: "Riunione", event: "Impegno", busy: "Occupato" } as const;

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
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilitySearchComplete, setAvailabilitySearchComplete] = useState(false);
  const [availabilitySearchError, setAvailabilitySearchError] = useState(false);
  const [availability, setAvailability] = useState<Record<string, Availability>>(() => Object.fromEntries(days.map((day) => [day.iso, "checking"])));
  const availabilityRequests = useRef(new Map<string, Promise<Slot[]>>());
  const slotLoadId = useRef(0);
  const userSelectedDate = useRef(false);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [agendaNotice, setAgendaNotice] = useState("");
  const [mode, setMode] = useState<"stub" | "google">("stub");
  const [confirmation, setConfirmation] = useState<{ date: string; slot: string; name: string; topic: string } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ date: string; dateLabel: string; start: string; slot: string; name: string; email: string; topic: string; message: string } | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState({ name: "", email: "", topic: "", message: "" });
  const selectedSlot = slots.find((slot) => slot.start === selected);
  const dayEvents = date ? events.filter((event) => event.date === date) : [];

  const loadCalendar = useCallback(async () => {
    setAgendaLoading(true);
    setAgendaNotice("");
    try {
      const response = await fetch(`/api/calendar?from=${days[0].iso}&to=${days.at(-1)!.iso}`, { cache: "no-store" });
      const data = await response.json();
      if (data.mode === "stub" || data.mode === "google") setMode(data.mode);
      setEvents(response.ok && Array.isArray(data.events) ? data.events : []);
      if (!response.ok) setAgendaNotice(data.error || "Impossibile caricare l’agenda.");
    } catch {
      setEvents([]);
      setAgendaNotice("Agenda temporaneamente non disponibile.");
    } finally {
      setAgendaLoading(false);
    }
  }, [days]);

  const getDaySlots = useCallback((value: string) => {
    const existing = availabilityRequests.current.get(value);
    if (existing) return existing;
    setAvailability((current) => ({ ...current, [value]: "checking" }));
    const request = (async () => {
      try {
        const response = await fetch(`/api/availability?date=${encodeURIComponent(value)}`, { cache: "no-store" });
        const data = await response.json();
        if (data.mode === "stub" || data.mode === "google") setMode(data.mode);
        if (!response.ok || !Array.isArray(data.slots)) throw new Error("Disponibilità non disponibile");
        const result = data.slots as Slot[];
        setAvailability((current) => ({ ...current, [value]: availabilityFor(result) }));
        return result;
      } catch {
        setAvailability((current) => ({ ...current, [value]: "error" }));
        availabilityRequests.current.delete(value);
        return [];
      }
    })();
    availabilityRequests.current.set(value, request);
    return request;
  }, []);

  async function loadSlots(value: string) {
    const loadId = ++slotLoadId.current;
    setLoading(true);
    setSelected("");
    setErrors((current) => ({ ...current, slot: undefined }));
    setNotice("");
    const result = await getDaySlots(value);
    if (loadId !== slotLoadId.current) return;
    setSlots(result);
    if (!availabilityRequests.current.has(value)) setNotice("Errore rete: gli orari non sono disponibili in questo momento.");
    setLoading(false);
  }

  useEffect(() => { loadCalendar(); }, [loadCalendar]);
  useEffect(() => {
    let active = true;
    const findFirstAndLoadStatuses = async () => {
      setLoading(true);
      const futureDays = days;
      let firstAvailable: { day: Day; slots: Slot[] } | undefined;
      let searchFailed = false;
      for (const day of futureDays) {
        const result = await getDaySlots(day.iso);
        if (!availabilityRequests.current.has(day.iso)) {
          searchFailed = true;
          continue;
        }
        if (result.length) {
          firstAvailable = { day, slots: result };
          break;
        }
      }
      if (!active) return;
      if (firstAvailable && !userSelectedDate.current) {
        setDate(firstAvailable.day.iso);
        setSlots(firstAvailable.slots);
      } else if (!firstAvailable && !userSelectedDate.current) {
        setSlots([]);
      }
      if (!userSelectedDate.current) {
        setAvailabilitySearchError(searchFailed);
        setAvailabilitySearchComplete(true);
      }
      if (!userSelectedDate.current) setLoading(false);

      const remaining = futureDays.filter((day) => !availabilityRequests.current.has(day.iso));
      let cursor = 0;
      const workers = Array.from({ length: Math.min(3, remaining.length) }, async () => {
        while (active && cursor < remaining.length) {
          const day = remaining[cursor++];
          await getDaySlots(day.iso);
        }
      });
      await Promise.all(workers);
    };
    void findFirstAndLoadStatuses();
    return () => { active = false; };
  }, [days, getDaySlots]);

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
    if (!validate() || !selectedSlot || !date) return;
    const topic = form.topic.trim();
    const message = form.message.trim();
    setPendingConfirmation({
      date,
      dateLabel: longDate(date),
      start: selected,
      slot: selectedSlot.label,
      name: form.name.trim(),
      email: form.email.trim(),
      topic,
      message,
    });
    setNotice("");
    requestAnimationFrame(() => reviewHeading.current?.focus());
  }

  async function confirmRequest() {
    if (!pendingConfirmation || sending) return;
    const request = pendingConfirmation;
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: request.date, start: request.start, name: request.name, email: request.email, topic: request.topic, message: request.message }),
      });
      const data = await response.json();
      if (response.ok) {
        setConfirmation({ date: request.dateLabel, slot: request.slot, name: request.name, topic: request.topic });
        setPendingConfirmation(null);
        availabilityRequests.current.delete(request.date);
        await Promise.all([loadSlots(request.date), loadCalendar()]);
      } else {
        setNotice(data.error || "Invio non riuscito. Riprova o contattami direttamente.");
      }
    } catch {
      setNotice("Invio non riuscito. Riprova tra poco.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="site-header glass-bar">
        <a href="https://swarz.it">← swarz.it</a>
        <p>Antonio Scharmuller</p>
        <nav aria-label="Navigazione principale">
          <a href="#agenda">Agenda</a>
          <a href="#richiesta">Prenota</a>
          <a href="/admin">Admin</a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Attività · Progetti · Disponibilità</p>
          <h1>La mia agenda pubblica.</h1>
          <p>Uno spazio dove condivido i miei impegni pubblici, progetti e attività. Puoi consultare la disponibilità e richiedere un incontro.</p>
          <div className="hero-actions">
            <a className="primary-action" href="#agenda">Esplora l’agenda</a>
            <a className="secondary-action" href="#richiesta">Richiedi un incontro</a>
          </div>
        </div>
        <aside className="hero-status glass-card" aria-label="Stato del calendario">
          <span className={`status-dot ${mode}`} />
          <p className="eyebrow">Agenda live</p>
          <strong>{mode === "google" ? "Google Calendar collegato" : "Modalità dimostrativa"}</strong>
          <p>{mode === "google" ? "Disponibilità e impegni sono aggiornati dal calendario dedicato." : "I dati temporanei vengono azzerati al riavvio."}</p>
          <small>Europe/Rome · prossimi 30 giorni</small>
        </aside>
      </section>

      <section className="booking-panel glass-panel" id="agenda" aria-label="Agenda e richiesta calendario">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Agenda pubblica</p>
            <h2>Impegni e disponibilità.</h2>
          </div>
          <p>I titoli degli appuntamenti pubblici sono visibili. Richieste e impegni riservati compaiono soltanto come “Occupato”.</p>
        </div>

        <div className="booking-grid">
          <section className="calendar-side" aria-labelledby="day-title">
            <div className="section-title">
              <div>
                <p className="eyebrow">Prossimi 30 giorni</p>
                <h3 id="day-title">Scegli il giorno</h3>
              </div>
              <p>Seleziona una data per vedere agenda e slot prenotabili.</p>
            </div>
            <div className="day-grid" role="list">
              {days.map((day) => {
                const status = availability[day.iso] || "checking";
                const statusLabel = status === "available" ? "Disponibile" : status === "full" ? "Completo" : status === "error" ? "Disponibilità da verificare" : "Verifica disponibilità";
                const statusAriaLabel = status === "available" ? "Giorno disponibile" : status === "full" ? "Giorno completo" : status === "error" ? "Disponibilità non verificata" : "Verifica disponibilità";
                return (
                  <button
                    type="button"
                    key={day.iso}
                    className={`${date === day.iso ? "selected" : ""} ${day.isWeekend ? "weekend" : ""}`}
                    onClick={() => { userSelectedDate.current = true; setPendingConfirmation(null); setDate(day.iso); void loadSlots(day.iso); }}
                    disabled={sending}
                    aria-pressed={date === day.iso}
                    aria-label={`${day.weekday} ${day.day} ${day.month}${day.isToday ? ", oggi" : ""}: ${statusAriaLabel}`}
                    title={statusLabel}
                  >
                    <span>{day.weekday}</span>
                    <strong>{day.day}</strong>
                    <small>{day.month}{day.isToday ? " · oggi" : ""}</small>
                    <i className={`availability-dot ${status}`} aria-hidden="true" />
                    <small className="availability-label">{statusLabel}</small>
                  </button>
                );
              })}
            </div>

            <div className="day-agenda" aria-live="polite">
              <div className="agenda-date">
                <p className="eyebrow">Giornata selezionata</p>
                <h3>{date ? longDate(date) : "Nessuna data selezionata"}</h3>
              </div>
              {agendaLoading && <p className="inline-state">Aggiornamento agenda…</p>}
              {!agendaLoading && !date && <p className="inline-state">{availabilitySearchError ? "Non riesco a verificare la disponibilità. Seleziona un giorno per riprovare." : availabilitySearchComplete ? "Nessuna data prenotabile nei prossimi 30 giorni." : "Cerco la prima data con orari prenotabili."}</p>}
              {!agendaLoading && agendaNotice && <p className="message warn">{agendaNotice}</p>}
              {!agendaLoading && date && !agendaNotice && dayEvents.length === 0 && (
                <div className="empty-agenda"><span>○</span><p>Nessun impegno pubblico per questa giornata.</p></div>
              )}
              {!agendaLoading && dayEvents.map((event, index) => (
                <article className={`agenda-event ${event.kind}`} key={`${event.start}-${event.title}-${index}`}>
                  <div><span>{eventLabels[event.kind]}</span><time>{event.timeLabel}</time></div>
                  <strong>{event.title}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="form-side" id="richiesta" aria-labelledby="slot-title">
            <div className="steps" aria-label="Passaggi richiesta">
              <span className="active">1. Giorno</span>
              <span className={selected ? "active" : ""}>2. Orario</span>
          <span className={selected && slots.length ? "active" : ""}>3. Dati personali</span>
              <span className={pendingConfirmation ? "active" : ""}>4. Conferma</span>
            </div>
            <h2 id="slot-title">Orari disponibili</h2>
            {loading && <p className="inline-state" role="status" aria-live="polite">Caricamento orari…</p>}
            {!loading && !date && <p className="no-slots-state" role="status">{availabilitySearchError ? "Impossibile verificare la disponibilità. Seleziona un giorno per riprovare." : availabilitySearchComplete ? "Nessuna data prenotabile nei prossimi 30 giorni." : "Cerco la prima data con almeno un orario libero."}</p>}
            {!loading && date && !slots.length && <p className="no-slots-state" role="status">{notice || "Nessun orario disponibile per questa giornata. Seleziona un'altra data."}</p>}
            {!loading && slots.length > 0 && <form onSubmit={submit} noValidate>
              <div className="slot-picker" aria-disabled={Boolean(pendingConfirmation)}>
                <p className="hint">{longDate(date)} · orari Europe/Rome</p>
                <div className="slots" aria-live="polite">
                  {slots.map((slot) => (
                    <button type="button" key={slot.start} className={selected === slot.start ? "selected" : ""} onClick={() => setSelected(slot.start)} aria-pressed={selected === slot.start} disabled={Boolean(pendingConfirmation)}>
                      {slot.label}
                    </button>
                  ))}
                </div>
                {errors.slot && <p className="field-error">{errors.slot}</p>}
                {selectedSlot && <p className="summary">Riepilogo: {longDate(date)} · {selectedSlot.label}</p>}
                <button className="text-button" type="button" onClick={() => setSelected("")} disabled={!selected || Boolean(pendingConfirmation)}>Cambia orario</button>
              </div>

              {!pendingConfirmation && <>
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
                <p>La richiesta resta in attesa di approvazione. Nulla è confermato automaticamente. <a href="/privacy">Privacy</a></p>
                <button className="submit" disabled={sending || loading || !selected}>{selected ? "Rivedi richiesta" : "Scegli un orario"}</button>
              </div>
              </>}
              {pendingConfirmation && <section className="request-review" aria-labelledby="request-review-title" aria-live="polite">
                <p className="eyebrow">Controllo finale</p>
                <h2 id="request-review-title" ref={reviewHeading} tabIndex={-1}>Confermi la richiesta?</h2>
                <p>Stai richiedendo un incontro:</p>
                <dl>
                  <div><dt>Motivo</dt><dd>{pendingConfirmation.topic}</dd></div>
                  <div><dt>Quando</dt><dd>{pendingConfirmation.dateLabel} · {pendingConfirmation.slot}</dd></div>
                  <div><dt>Nome</dt><dd>{pendingConfirmation.name}</dd></div>
                  <div><dt>Email</dt><dd>{pendingConfirmation.email}</dd></div>
                  {pendingConfirmation.message && <div><dt>Messaggio</dt><dd>{pendingConfirmation.message}</dd></div>}
                </dl>
                <p className="review-note">La richiesta verrà verificata manualmente. L’orario non è confermato finché non ricevi l’approvazione.</p>
                <div className="review-actions">
                  <button className="submit" type="button" onClick={() => void confirmRequest()} disabled={sending}>{sending ? "Invio in corso…" : "Conferma richiesta"}</button>
                  <button className="text-button" type="button" onClick={() => { setPendingConfirmation(null); requestAnimationFrame(() => document.getElementById("name")?.focus()); }} disabled={sending}>Modifica</button>
                </div>
              </section>}
              {notice && <p className="message warn" role="status" aria-live="polite">{notice}</p>}
            </form>}
            {confirmation && (
              <div className="confirmation" role="status" aria-live="polite">
                <h2>Richiesta ricevuta.</h2>
                <p>È in attesa di verifica manuale. Ti invieremo un invito se la richiesta verrà approvata.</p>
                <dl>
                  <div><dt>Nome</dt><dd>{confirmation.name}</dd></div>
                  <div><dt>Quando</dt><dd>{confirmation.date} · {confirmation.slot}</dd></div>
                  <div><dt>Motivo</dt><dd>{confirmation.topic}</dd></div>
                </dl>
              </div>
            )}
          </section>
        </div>
      </section>

      <footer className="glass-bar">
        <span>© {new Date().getFullYear()} Antonio Scharmuller</span>
        <span>Agenda personale e richieste di incontro · <a href="/privacy">Privacy</a></span>
      </footer>
    </main>
  );
}
