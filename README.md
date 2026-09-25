# Calendario Swarz

Agenda pubblica e booking su `127.0.0.1:3017`. Il calendario pubblico espone soltanto titolo e orario degli eventi
pubblicabili; richieste ed eventi privati vengono redatti come `Occupato`. L'area `/admin` gestisce corsi, riunioni e
richieste attraverso un Google Calendar dedicato.

```bash
docker compose up -d --build
curl 'http://127.0.0.1:3017/api/availability?date=YYYY-MM-DD'
```

Lo stub in memoria è destinato esclusivamente a sviluppo e test. In produzione, scritture e pannello admin restano
fail-closed finché Google OAuth, `ADMIN_PASSWORD_HASH` e un `ADMIN_SESSION_SECRET` di almeno 32 caratteri non sono
configurati tramite la procedura esterna autorizzata. Il formato password è `scrypt$<salt-hex>$<hash-hex>` con hash di
64 byte. Non commettere `.env` e non inserire secret nei log o nella documentazione.
