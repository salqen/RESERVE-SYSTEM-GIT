# RESERVE SYSTEM

Rezervačný systém pre ubytovanie + služby (Express + TypeScript + PostgreSQL), napojený na keepi ERP a service manager.

## Obsah repa

- `rezervacny-system/` – backend (API, availability engine, booking flow, ERP adaptér, webhooky)
- `rezervacny-system-navrh.md` – pôvodný návrh systému (doména, dátový model, integrácie, voľba technológií)
- `postup-vytvorenia.md` – plán vývoja vo fázach 0–5 + aktuálny stav implementácie
- `EDIT-LOG.md` – záznam zmien v projekte

## Stav

Fázy 1–3 hotové: dátový model s exclusion constraints (ochrana proti double-bookingu v DB), availability + booking flow (hold/confirm/cancel, idempotencia, storno politiky, admin kalendár), integrácia na keepi ERP (outbox worker s retry, podklad faktúry, stav platby webhookom) a service manager (timeoff + detekcia konfliktov).

## Spustenie

```bash
cd rezervacny-system
npm install
cp .env.example .env   # doplň DATABASE_URL, KEEPI_*, SERVICE_MANAGER_WEBHOOK_SECRET
npm run db:init
npm run dev
```

Testy (bežia proti in-process Postgresu PGlite, netreba DB): `npm test`
