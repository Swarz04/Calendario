"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type AdminEvent = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  kind: string;
  visibility: string;
  requestStatus: string;
  requestName: string;
  requestEmail: string;
  recurrence: string[];
};

type EventForm = {
  title: string;
  kind: "lesson" | "meeting";
  date: string;
  startTime: string;
  endTime: string;
  visibility: "public" | "private";
  recurrence: "none" | "weekly";
  repeatUntil: string;
};

type AgendaFilter = "today" | "week" | "all";

const emptyForm: EventForm = {
  title: "",
  kind: "lesson",
  date: "",
  startTime: "09:00",
  endTime: "10:00",
  visibility: "private",
  recurrence: "none",
  repeatUntil: "",
};

function localPart(value: string, part: "date" | "time") {
  if (!value) return "";
  const options: Intl.DateTimeFormatOptions = part === "date"
    ? { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }
    : { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return new Intl.DateTimeFormat(part === "date" ? "en-CA" : "it-IT", options).format(new Date(value));
}

function recurrenceEnd(start: string, recurrence: string[]) {
  const match = recurrence.find((rule) => rule.startsWith("RRULE:FREQ=WEEKLY"))?.match(/COUNT=(\d+)/);
  if (!match) return "";
  const date = new Date(`${localPart(start, "date")}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (Number(match[1]) - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function formatWhen(event: AdminEvent) {
  if (!event.start) return "Orario non disponibile";
  const date = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "short" }).format(new Date(event.start));
  return `${date} · ${localPart(event.start, "time")}–${localPart(event.end, "time")}`;
}

function dateAfter(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function AdminPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [requests, setRequests] = useState<AdminEvent[]>([]);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [tab, setTab] = useState<"agenda" | "requests">("agenda");
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>("all");
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [message, setMessage] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const logoutLock = useRef(false);

  const managedEvents = useMemo(
    () => events.filter((event) => event.kind === "lesson" || event.kind === "meeting")
      .sort((a, b) => a.start.localeCompare(b.start)),
    [events],
  );
  const todayIso = localPart(new Date().toISOString(), "date");
  const weekEndIso = dateAfter(todayIso, 7);
  const todayEvents = managedEvents.filter((event) => localPart(event.start, "date") === todayIso);
  const upcomingEvents = managedEvents.filter((event) => Date.parse(event.start) >= Date.now()).slice(0, 5);
  const filteredEvents = managedEvents.filter((event) => {
    const eventDate = localPart(event.start, "date");
    if (agendaFilter === "today") return eventDate === todayIso;
    if (agendaFilter === "week") return eventDate >= todayIso && eventDate < weekEndIso;
    return true;
  });

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const [eventsResponse, requestsResponse] = await Promise.all([
        fetch("/api/admin/events", { cache: "no-store" }),
        fetch("/api/admin/requests", { cache: "no-store" }),
      ]);
      if (eventsResponse.status === 401 || requestsResponse.status === 401) {
        setAuthenticated(false);
        return;
      }
      const eventsData = await eventsResponse.json();
      const requestsData = await requestsResponse.json();
      if (!eventsResponse.ok || !requestsResponse.ok) throw new Error(eventsData.error || requestsData.error || "Caricamento non riuscito");
      setEvents(eventsData.events || []);
      setRequests(requestsData.requests || []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Caricamento non riuscito";
      setDashboardError(errorMessage);
      throw error;
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setConfigured(Boolean(data.configured));
        setAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadDashboard().catch(() => undefined);
  }, [authenticated, loadDashboard]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Accesso non riuscito");
      setPassword("");
      setDashboardLoading(true);
      setAuthenticated(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Accesso non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLogoutBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Logout non riuscito. Riprova.");
      setAuthenticated(false);
      setEvents([]);
      setRequests([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logout non riuscito. Riprova.");
    } finally {
      logoutLock.current = false;
      setLogoutBusy(false);
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.visibility === "public" && !window.confirm("Rendere pubblico questo evento? Il titolo sarà visibile nel calendario pubblico.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(editingId ? `/api/admin/events/${encodeURIComponent(editingId)}` : "/api/admin/events", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito");
      setForm(emptyForm);
      setEditingId("");
      setMessage(editingId ? "Evento aggiornato." : "Evento creato.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Salvataggio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  function editEvent(event: AdminEvent) {
    const weekly = event.recurrence.some((rule) => rule.startsWith("RRULE:FREQ=WEEKLY"));
    setEditingId(event.id);
    setForm({
      title: event.title,
      kind: event.kind === "meeting" ? "meeting" : "lesson",
      date: localPart(event.start, "date"),
      startTime: localPart(event.start, "time"),
      endTime: localPart(event.end, "time"),
      visibility: event.visibility === "public" ? "public" : "private",
      recurrence: weekly ? "weekly" : "none",
      repeatUntil: weekly ? recurrenceEnd(event.start, event.recurrence) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeEvent(event: AdminEvent) {
    if (!window.confirm(`Eliminare “${event.title}”?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Eliminazione non riuscita");
      setMessage("Evento eliminato.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Eliminazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function resolveRequest(id: string, action: "accept" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Operazione non riuscita");
      setMessage(action === "accept" ? "Richiesta accettata e invito inviato." : "Richiesta rifiutata; lo slot è di nuovo libero.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = tab === "agenda" ? 0 : 1;
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (current + 1) % 2;
    if (event.key === "ArrowLeft") next = (current + 1) % 2;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = 1;
    if (next === undefined) return;
    event.preventDefault();
    setTab(next === 0 ? "agenda" : "requests");
    tabRefs.current[next]?.focus();
  }

  if (configured === null) return <main className="admin-shell"><p className="inline-state">Verifica configurazione…</p></main>;

  if (!configured) {
    return (
      <main className="admin-shell">
        <section className="admin-login glass-panel">
          <p className="eyebrow">Configurazione richiesta</p>
          <h1>Admin non ancora attivo.</h1>
          <p>Google Calendar e i secret di sessione devono essere configurati fuori dal repository. Il pannello resta chiuso in modo sicuro.</p>
          <a className="secondary-action" href="/">Torna al calendario</a>
        </section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-shell">
        <section className="admin-login glass-panel">
          <p className="eyebrow">Area riservata</p>
          <h1>Gestisci il tuo tempo.</h1>
          <p>Accedi per pubblicare corsi e riunioni o valutare le richieste di colloquio.</p>
          <form onSubmit={login}>
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required minLength={8} />
            <button className="submit" disabled={busy}>{busy ? "Verifica…" : "Accedi"}</button>
          </form>
          {message && <p className="message warn" role="alert">{message}</p>}
          <a className="admin-back" href="/">← Torna al calendario</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header glass-bar">
        <div><p className="eyebrow">Calendario admin</p><strong>Antonio Scharmuller</strong></div>
        <div><a href="/">Vista pubblica</a><button type="button" onClick={logout} disabled={logoutBusy}>{logoutBusy ? "Uscita…" : "Esci"}</button></div>
      </header>

      <section className="admin-hero">
        <div><p className="eyebrow">Control room</p><h1>Agenda e richieste.</h1></div>
        <div className="admin-stats">
          <span><strong>{dashboardLoading ? "—" : todayEvents.length}</strong> eventi oggi</span>
          <span><strong>{dashboardLoading ? "—" : requests.length}</strong> richieste pendenti</span>
        </div>
      </section>

      {message && <p className="message admin-message" role="status">{message}</p>}
      {dashboardError && <p className="message warn" role="alert">Dati admin non disponibili: {dashboardError}</p>}

      <section className="admin-upcoming glass-panel" aria-labelledby="upcoming-title" aria-busy={dashboardLoading}>
        <div className="upcoming-heading"><div><p className="eyebrow">Panoramica</p><h2 id="upcoming-title">Prossimi appuntamenti</h2></div><span>Fino a 5 eventi</span></div>
        {dashboardLoading && <p className="inline-state" role="status">Caricamento eventi e richieste…</p>}
        {!dashboardLoading && dashboardError && <p className="inline-state">Ricarica la pagina per riprovare.</p>}
        {!dashboardLoading && !dashboardError && !upcomingEvents.length && <p className="inline-state">Non ci sono appuntamenti futuri.</p>}
        {!dashboardLoading && !dashboardError && upcomingEvents.length > 0 && <ol className="upcoming-list">
          {upcomingEvents.map((event) => <li key={event.id}>
            <time dateTime={event.start}>{formatWhen(event)}</time>
            <strong>{event.title}</strong>
            <span className="visibility-badge">{event.visibility === "public" ? "Pubblico" : "Privato"}</span>
          </li>)}
        </ol>}
      </section>

      <div className="admin-grid">
        <section className="event-editor glass-panel">
          <div className="section-title"><div><p className="eyebrow">{editingId ? "Modifica" : "Nuovo evento"}</p><h2>{editingId ? "Aggiorna l’impegno" : "Scrivi in agenda"}</h2></div></div>
          <form onSubmit={saveEvent}>
            <div className="field full"><label htmlFor="event-title">Titolo evento</label><input id="event-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} required /></div>
            <div className="details">
              <div className="field"><label htmlFor="event-kind">Categoria</label><select id="event-kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as EventForm["kind"] })}><option value="lesson">Lezione</option><option value="meeting">Riunione</option></select></div>
              <div className="field"><label htmlFor="event-date">Data</label><input id="event-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></div>
              <div className="field"><label htmlFor="event-start">Inizio</label><input id="event-start" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></div>
              <div className="field"><label htmlFor="event-end">Fine</label><input id="event-end" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></div>
              <div className="field"><label htmlFor="event-recurrence">Ripetizione</label><select id="event-recurrence" value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as EventForm["recurrence"], repeatUntil: event.target.value === "none" ? "" : form.repeatUntil })}><option value="none">Evento singolo</option><option value="weekly">Ogni settimana</option></select></div>
              {form.recurrence === "weekly" && <div className="field"><label htmlFor="event-until">Ripeti fino al</label><input id="event-until" type="date" min={form.date} value={form.repeatUntil} onChange={(event) => setForm({ ...form, repeatUntil: event.target.value })} required /></div>}
            </div>
            <label className="visibility-toggle"><input type="checkbox" checked={form.visibility === "public"} onChange={(event) => setForm({ ...form, visibility: event.target.checked ? "public" : "private" })} /><span><strong>{form.visibility === "public" ? "Evento pubblico" : "Evento privato"}</strong><small>{form.visibility === "public" ? "Il titolo sarà visibile nel calendario pubblico." : "Nel calendario pubblico sarà mostrato come “Occupato”."}</small></span></label>
            <div className="editor-actions"><button className="submit" disabled={busy}>{editingId ? "Salva modifiche" : form.visibility === "public" ? "Crea evento pubblico" : "Crea evento privato"}</button>{editingId && <button className="text-button" type="button" onClick={() => { setEditingId(""); setForm(emptyForm); }}>Annulla</button>}</div>
          </form>
        </section>

        <section className="admin-list glass-panel">
          <div className="admin-tabs" role="tablist" aria-label="Sezioni amministrazione">
            <button id="admin-tab-agenda" ref={(element) => { tabRefs.current[0] = element; }} type="button" role="tab" aria-controls="admin-panel-agenda" aria-selected={tab === "agenda"} tabIndex={tab === "agenda" ? 0 : -1} className={tab === "agenda" ? "active" : ""} onClick={() => setTab("agenda")} onKeyDown={handleTabKeyDown}>Agenda</button>
            <button id="admin-tab-requests" ref={(element) => { tabRefs.current[1] = element; }} type="button" role="tab" aria-controls="admin-panel-requests" aria-selected={tab === "requests"} tabIndex={tab === "requests" ? 0 : -1} className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")} onKeyDown={handleTabKeyDown}>Richieste <span>{dashboardLoading ? "—" : requests.length}</span></button>
          </div>

          <section id="admin-panel-agenda" role="tabpanel" aria-labelledby="admin-tab-agenda" tabIndex={0} hidden={tab !== "agenda"}>
            <div className="agenda-filters" role="group" aria-label="Filtra gli eventi dell’agenda">
              {([ ["today", "Oggi"], ["week", "Settimana"], ["all", "Tutti"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={agendaFilter === value} className={agendaFilter === value ? "active" : ""} onClick={() => setAgendaFilter(value)}>{label}</button>)}
            </div>
            <div className="admin-cards" aria-busy={dashboardLoading}>
              {dashboardLoading && <p className="inline-state" role="status">Caricamento eventi…</p>}
              {!dashboardLoading && dashboardError && <p className="inline-state">Ricarica la pagina per riprovare.</p>}
              {!dashboardLoading && !dashboardError && !filteredEvents.length && <p className="inline-state">Nessun evento per questo filtro.</p>}
              {!dashboardLoading && !dashboardError && filteredEvents.map((event) => <article className="admin-card" key={event.id}>
                <div><span className={`event-badge ${event.kind}`}>{event.kind === "lesson" ? "Lezione" : "Riunione"}</span><span className="visibility-badge">{event.visibility === "public" ? "Pubblico" : "Privato"}</span></div>
                <h3>{event.title}</h3><p>{formatWhen(event)}{event.recurrence.length ? " · settimanale" : ""}</p>
                <div className="card-actions"><button type="button" onClick={() => editEvent(event)}>Modifica</button><button className="danger" type="button" onClick={() => removeEvent(event)} disabled={busy}>Elimina</button></div>
              </article>)}
            </div>
          </section>

          <section id="admin-panel-requests" role="tabpanel" aria-labelledby="admin-tab-requests" tabIndex={0} hidden={tab !== "requests"}>
            <div className="admin-cards" aria-busy={dashboardLoading}>
              {dashboardLoading && <p className="inline-state" role="status">Caricamento richieste…</p>}
              {!dashboardLoading && dashboardError && <p className="inline-state">Ricarica la pagina per riprovare.</p>}
              {!dashboardLoading && !dashboardError && !requests.length && <p className="inline-state">Nessuna richiesta in attesa.</p>}
              {!dashboardLoading && !dashboardError && requests.map((request) => <article className="admin-card request-card" key={request.id}>
                <div><span className="event-badge request">In attesa</span></div>
                <h3>{request.requestName}</h3><p>{formatWhen(request)} · {request.requestEmail}</p><p className="request-reason">{request.description}</p>
                <div className="card-actions"><button className="accept" type="button" onClick={() => resolveRequest(request.id, "accept")} disabled={busy}>Accetta e invita</button><button className="danger" type="button" onClick={() => resolveRequest(request.id, "reject")} disabled={busy}>Rifiuta</button></div>
              </article>)}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
