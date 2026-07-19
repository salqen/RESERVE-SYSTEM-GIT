# RESERVE SYSTEM

Rezervačný systém pre ubytovanie + služby (Express + TypeScript + PostgreSQL), napojený na keepi ERP a service manager.

## Obsah repa

- koreň repa – **backend** (Express + TypeScript: API, availability engine, booking flow, ERP adaptér, webhooky) – `src/`, `db/`, `tests/`, `scripts/`
- `web/` – zákaznícky web (Next.js 14, App Router, TypeScript) – samostatne buildovateľný
- `rezervacny-system-navrh.md` – pôvodný návrh systému (doména, dátový model, integrácie, voľba technológií)
- `postup-vytvorenia.md` – plán vývoja vo fázach 0–5 + aktuálny stav implementácie
- `EDIT-LOG.md` – záznam zmien v projekte

## Stav

Fázy 1–3 hotové, Fáza 4 – jadro hotové: dátový model s exclusion constraints (ochrana proti double-bookingu v DB), availability + booking flow (hold/confirm/cancel, idempotencia, storno politiky, admin kalendár), integrácia na keepi ERP (outbox worker s retry, podklad faktúry, stav platby webhookom), service manager (timeoff + detekcia konfliktov) a zákaznícky web (vyhľadanie termínov, hold → checkout → potvrdenie, samoobslužné storno). Zostáva: reálna platobná brána, e-maily, zákaznícky účet.

## Spustenie – backend (koreň repa)

```bash
npm install
cp .env.example .env   # doplň DATABASE_URL, KEEPI_*, SERVICE_MANAGER_WEBHOOK_SECRET, WEB_ORIGIN
npm run db:init        # idempotentné – vytvorí schému, ak neexistuje
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

## Deploy – Railway (celý systém z tohto repa)

V Railway projekte vytvor 3 služby:

1. **PostgreSQL** – pluginová služba Railway.
2. **Backend** – New Service → GitHub repo, Root Directory nechaj prázdny (koreň). Config si zoberie z `railway.toml`: build `npm ci && npm run build`, pre-deploy `npm run db:init` (sám vytvorí schému), start `npm start`, healthcheck `/health`. Env premenné: `DATABASE_URL` (referencia `${{Postgres.DATABASE_URL}}`), `WEB_ORIGIN` (URL web služby), `KEEPI_API_URL`, `KEEPI_API_KEY`, `KEEPI_WEBHOOK_SECRET`, `SERVICE_MANAGER_WEBHOOK_SECRET`. `PORT` dodá Railway.
3. **Web** – New Service → to isté repo, **Root Directory = `web`** (config `web/railway.toml`). Env: `API_URL` = URL backendu (interná `http://<backend>.railway.internal:<port>` alebo verejná `https://<backend>.up.railway.app`).

Backend je dlho bežiaci proces – cleanup job aj ERP outbox worker fungujú bez úprav. Každej službe sa oplatí nastaviť watch paths (`src/**`, `db/**` pre backend; `web/**` pre web), aby sa deployovala len zmenená časť.
