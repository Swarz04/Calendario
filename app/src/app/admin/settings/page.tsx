"use client";

import { useEffect, useState } from "react";

type GoogleStatus = { google: "connected" | "attention"; calendars: { primary: boolean; requests: boolean }; checkedAt: string };

export default function AdminSettingsPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await fetch("/api/admin/session", { cache: "no-store" });
        const sessionData = await session.json();
        if (!sessionData.authenticated) {
          if (active) setAuthenticated(false);
          return;
        }
        if (active) setAuthenticated(true);
        const response = await fetch("/api/admin/status", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Stato Google non disponibile");
        if (active) setStatus(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Stato Google non disponibile");
      }
    })();
    return () => { active = false; };
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Logout non riuscito. Riprova.");
      window.location.assign("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Logout non riuscito. Riprova.");
      setLoggingOut(false);
    }
  }

  if (authenticated === false) return <main className="admin-shell"><section className="admin-login glass-panel"><p className="eyebrow">Area riservata</p><h1>Accesso richiesto.</h1><p>Accedi all’area amministrativa per visualizzare le impostazioni.</p><a className="secondary-action" href="/admin">Vai al login</a></section></main>;

  return <main className="admin-shell">
    <header className="admin-header glass-bar"><div><p className="eyebrow">Calendario admin</p><strong>Impostazioni</strong></div><div><a href="/admin">Dashboard</a><button type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Uscita…" : "Esci"}</button></div></header>
    <section className="settings-panel glass-panel" aria-busy={authenticated === null || (!status && !error)}>
      <p className="eyebrow">Profilo e integrazioni</p><h1>Stato dei collegamenti.</h1>
      {authenticated === null && <p className="inline-state" role="status">Verifica sessione…</p>}
      {status && <>
        <p className={`settings-state ${status.google === "connected" ? "connected" : "attention"}`} role="status">{status.google === "connected" ? "Google Calendar collegato" : "Verifica necessaria"}</p>
        <ul className="settings-checks">
          <li><span>Calendario principale</span><strong>{status.calendars.primary ? "Accessibile" : "Non accessibile"}</strong></li>
          <li><span>Calendario richieste</span><strong>{status.calendars.requests ? "Accessibile" : "Non accessibile"}</strong></li>
        </ul>
        <p className="settings-checked">Ultimo controllo: {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(status.checkedAt))} · Europe/Rome</p>
      </>}
      {error && <p className="message warn" role="alert">{error}</p>}
      <div className="settings-note"><strong>Password amministratore</strong><p>La password può essere aggiornata solo tramite la procedura operativa server; non viene gestita da questa pagina.</p></div>
      <a className="secondary-action" href="/admin">Torna alla dashboard</a>
    </section>
  </main>;
}
