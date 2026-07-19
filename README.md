# RESERVE SYSTEM

Rezervačný systém pre ubytovanie + služby (Express + TypeScript + PostgreSQL), napojený na keepi ERP a service manager.

## Obsah repa

- `rezervacny-system/` – backend (API, availability engine, booking flow, ERP adaptér, webhooky)
- `web/` – zákaznícky web (Next.js 14, App Router, TypeScript)
- `rezervacny-system-navrh.md` – pôvodný návrh systému (doména, dátový model, integrácie, voľba technológií)
- `postup-vytvorenia.md` – plán vývoja vo fázach 0–5 + aktuálny stav implementácie
- `EDIT-LOG.md` – záznam zmien v projekte

## Stav

Fázy 1–3 hotové, Fáza 4 – jadro hotové: dátový model s exclusion constraints (ochrana proti double-bookingu v DB), availability + booking flow (hold/confirm/cancel, idempotencia, storno politiky, admin kalendár), integrácia na keepi ERP (outbox worker s retry, podklad faktúry, stav platby webhookom), service manager (timeoff + detekcia konfliktov) a zákaznícky web (vyhľadanie termínov, hold → checkout → potvrdenie, samoobslužné storno). Zostáva: reálna platobná brána, e-maily, zákaznícky účet.

## Spustenie – backend

```bash
cd rezervacny-system
npm install
cp .env.example .env   # doplň DATABASE_URL, KEEPI_*, SERVICE_MANAGER_WEBHOOK_SECRET, WEB_ORIGIN
npm run db:init
npm run dev            # beží na :3001
```

Testy (bežia proti in-process Postgresu PGlite, netreba DB): `npm test`

## Spustenie – web

```bash
cd web
npm install
cp .env.example .env   # API_URL=http://localhost:3001
npm run dev            # beží na :3000
```

## Deploy (Vercel)

Repo root nie je Next.js aplikácia – vo Vercel Project Settings nastav **Root Directory = `web`**, inak deploy skončí na 404. Backend (Express + background joby) potrebuje vlastný hosting (Railway/Fly/Render/VPS); na Verceli by vyžadoval serverless úpravu (joby → cron).
