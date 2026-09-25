# Calendario Swarz

**Applicazione web full-stack per gestione calendario, disponibilità e prenotazioni.**

## Descrizione progetto

Calendario Swarz è un'applicazione web sviluppata con Next.js per organizzare attività universitarie, professionali e personali. Offre un calendario pubblico con disponibilità e richieste di incontro, un'area amministrativa privata per gestire eventi e richieste e l'integrazione con Google Calendar.

## Screenshot

Le immagini del progetto sono raccolte in `docs/screenshots/`.

### Homepage pubblica

![Homepage pubblica](docs/screenshots/homepage-pubblica.png)

### Login amministratore

![Login amministratore](docs/screenshots/login-amministratore.png)

### Dashboard admin

![Dashboard amministratore](docs/screenshots/dashboard-admin.png)

### Gestione eventi pubblici e privati

![Gestione eventi pubblici e privati](docs/screenshots/gestione-eventi.png)

## Architettura

```text
Client
  │
  ▼
Next.js Application
  │
  ▼
API Layer (Next.js Route Handlers)
  ├── autenticazione e operazioni amministrative
  ├── disponibilità e richieste di prenotazione
  │
  ▼
Google Calendar API
```

- **Frontend pubblico:** presenta il calendario, gli eventi autorizzati alla pubblicazione e il flusso per inviare richieste.
- **API server:** gestisce disponibilità, richieste e operazioni amministrative sul server Next.js.
- **Autenticazione amministrativa:** verifica credenziali e sessioni prima di consentire l'accesso alle funzioni riservate.
- **Integrazione Google:** il server comunica con Google Calendar tramite OAuth 2.0; le credenziali non vengono esposte al client.

## Funzionalità principali

### Calendario pubblico

- Visualizzazione della disponibilità per data e fascia oraria.
- Mostra i dettagli degli eventi autorizzati come pubblici; gli eventi riservati sono presentati come occupazione.
- Invio di richieste di incontro con riepilogo prima della conferma.

### Area amministrativa

- Login amministratore.
- Creazione, modifica ed eliminazione degli eventi del calendario.
- Gestione delle richieste ricevute.
- Controllo della visibilità pubblica o privata degli eventi.

## Sicurezza

- Verifica delle password con hashing scrypt.
- Sessioni firmate con HMAC e durata limitata.
- Cookie di sessione `HttpOnly` e `SameSite=Strict`, con flag `Secure` in produzione.
- Rate limiting dei tentativi di accesso, basato sull'indirizzo del client ricevuto tramite `X-Real-IP`.
- Validazione degli input lato server e controllo dell'origine per le operazioni amministrative.
- Separazione dei dati pubblici e privati: solo gli eventi con visibilità esplicitamente pubblica mostrano il titolo.
- OAuth 2.0 per Google Calendar gestito lato server.

## Tecnologie

**Frontend**

- Next.js
- React
- TypeScript
- CSS

**Backend e integrazioni**

- Node.js
- Next.js Route Handlers
- Google Calendar API
- OAuth 2.0

**Distribuzione**

- Linux VPS
- Docker
- HTTPS

## Testing

Il repository include test automatici per le principali funzioni di dominio e sicurezza. Gli script di progetto supportano il typecheck, la build di produzione e il controllo delle vulnerabilità delle dipendenze tramite npm.

## Deployment

L'applicazione viene distribuita tramite Docker su una VPS Linux ed è servita tramite HTTPS. La configurazione dell'ambiente di esecuzione è separata dal codice sorgente.

## Struttura del progetto

```text
.
├── app/
│   ├── src/app/          # Pagine, layout e API Route Handlers
│   ├── src/lib/          # Logica di dominio, sicurezza e integrazioni
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

## Obiettivo accademico

Il progetto integra sviluppo web full-stack, sicurezza applicativa, integrazione di API esterne e gestione di un ambiente server reale.
