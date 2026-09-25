# Calendario Swarz

Applicazione web full-stack per la gestione di un calendario pubblico e di richieste di prenotazione con approvazione amministrativa.

## Descrizione

Calendario Swarz è sviluppato con Next.js e integra Google Calendar API v3. La vista pubblica mostra disponibilità, impegni autorizzati e permette di inviare richieste di incontro. Le richieste restano separate dagli appuntamenti effettivi finché l’amministratore non le approva.

## Architettura

```text
Browser
  │
  ▼
Next.js (pagine e API server-side)
  ├── Vista pubblica e flusso di richiesta
  ├── Area amministrativa autenticata
  └── Google Calendar API v3 (OAuth 2.0 server-side)
        ├── Calendario principale: disponibilità e appuntamenti confermati
        └── Calendario richieste: pending, accepted e rejected
```

Il client comunica con route handler Next.js. Le credenziali OAuth e le operazioni Google restano sul server. Il calendario richieste è distinto dal calendario principale; una richiesta pending non riserva lo slot. In fase di approvazione la disponibilità viene controllata di nuovo e l’evento viene creato con un identificativo stabile, così i retry non generano appuntamenti duplicati.

## Funzionalità

### Calendario pubblico

- Disponibilità e selezione degli slot in `Europe/Rome`.
- Invio di richieste con nome, email, motivo e messaggio facoltativo.
- Flusso di revisione prima dell’invio.
- Gli impegni privati vengono rappresentati come “Occupato”.

### Area amministrativa

- Accesso riservato e dashboard per eventi e richieste.
- Accettazione o rifiuto delle richieste, con storico.
- Accettazione con visibilità privata predefinita e scelta pubblica esplicita.
- Migrazione ripetibile delle richieste legacy verso il calendario dedicato.
- Impostazioni con stato di accesso ai due calendari Google.

## Privacy e sicurezza

- Password amministrativa verificate con scrypt.
- Sessioni firmate HMAC e cookie `HttpOnly`, `SameSite=Strict`, `Secure` in produzione.
- Controllo Origin per le mutazioni e rate limiting dei tentativi di accesso e delle richieste pubbliche.
- Validazione server-side dei dati ricevuti.
- OAuth 2.0 e token Google mantenuti server-side.
- Il renderer pubblico usa una policy default-deny: mostra titoli solo per eventi `visibility="public"`; eventi privati, confidenziali o senza visibilità esplicita sono mostrati come “Occupato”. Email, motivo e messaggi non vengono esposti.

## Tecnologie

- Next.js, React, TypeScript e CSS
- Node.js e route handler Next.js
- Google Calendar API v3 e OAuth 2.0
- Docker su VPS Linux con HTTPS

## Test

La suite automatizzata copre mapping e privacy degli eventi, prenotazione e approvazione idempotente, migrazione legacy, controllo accessi e rate limiting.

```bash
npm test
NODE_OPTIONS="--max-old-space-size=2048" npm run verify
npm audit
```

## Configurazione e distribuzione

La distribuzione avviene tramite Docker su VPS Linux. Le credenziali OAuth, i segreti di sessione e gli ID dei calendari sono configurati nell’ambiente server e non fanno parte del repository. Il workflow richiede un calendario Google separato e privato per le richieste.

## Struttura essenziale

```text
src/app/       Pagine e API route
src/lib/       Integrazione Google, sicurezza e logica calendario
Dockerfile     Immagine applicativa
docker-compose.yml
```

## Obiettivo accademico

Il progetto integra sviluppo web full-stack, sicurezza applicativa, integrazione con API esterne e gestione di un ambiente server reale.
