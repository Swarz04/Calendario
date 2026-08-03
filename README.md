# Calendario Swarz

MVP di booking su `127.0.0.1:3017`. Senza credenziali Google usa uno stub in memoria; nessun evento reale viene creato.

```bash
docker compose up -d --build
curl 'http://127.0.0.1:3017/api/availability?date=YYYY-MM-DD'
```

Per OAuth, copiare `app/.env.example` in `app/.env` e compilare i valori in un passaggio dedicato. Non commettere `.env`.
