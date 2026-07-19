# Edit log – RESERVE SYSTEM

Záznam zmien v projektových dokumentoch. Formát: dátum | súbor | zmena | autor.

| Dátum | Súbor | Zmena | Autor |
|---|---|---|---|
| 2026-07-19 | rezervacny-system-navrh.md | Pôvodný návrh systému (doménová logika, dátový model, integrácie, voľba technológií, Go vs. TS) | MediaVolt team |
| 2026-07-19 | postup-vytvorenia.md | Vytvorený postup vývoja v 6 fázach (0–5) na základe návrhu; stack prispôsobený existujúcemu ERP (Express + Upstash Redis, Vercel) | Claude |
| 2026-07-19 | EDIT-LOG.md | Založený edit log | Claude |
| 2026-07-19 | db/schema.sql | Fáza 2: pridané storno politiky (cancellation_policy + cancellation_tier), FK z room/service a snapshot na booking_room/booking_service | Claude |
| 2026-07-19 | src/modules/bookings/cancellation.ts | Fáza 2: čistá logika výpočtu refundu podľa času do začiatku (pásma) | Claude |
| 2026-07-19 | src/modules/bookings/service.ts | Fáza 2: cancelBooking počíta refund/poplatok a zapisuje do outboxu; hold snapshotuje storno politiku položiek | Claude |
| 2026-07-19 | src/modules/admin/router.ts | Fáza 2: admin kalendár GET /admin/calendar (obsadenosť izieb + sloty a timeoff zdrojov) | Claude |
| 2026-07-19 | tests/cancellation.test.ts | Fáza 2: unit testy refund logiky | Claude |
| 2026-07-19 | tests/booking.db.test.ts | Fáza 1/2: integračné race-condition testy proti PGlite (exclusion constraints, buffer, uvoľnenie po storne) | Claude |
| 2026-07-19 | package.json | Pridaný dev dependency @electric-sql/pglite (in-process Postgres pre testy) | Claude |
| 2026-07-19 | db/schema.sql | Fáza 3: booking.erp_invoice_id + payment_status (väzba na keepi faktúru a stav platby) | Claude |
| 2026-07-19 | src/modules/erp/keepi.ts | Fáza 3: keepi klient (podklad faktúry, storno) + čistý buildInvoiceBasis | Claude |
| 2026-07-19 | src/modules/erp/sender.ts | Fáza 3: outbox sender – mapuje booking.confirmed/cancelled na volania keepi, ukladá erp_invoice_id | Claude |
| 2026-07-19 | src/modules/webhooks/signature.ts | Fáza 3: HMAC-SHA256 podpis/overenie webhookov (timing-safe) | Claude |
| 2026-07-19 | src/modules/webhooks/timeoff.ts | Fáza 3: príjem timeoff zo service managera + detekcia konfliktov s rezerváciami (audit + notifikácia do outboxu) | Claude |
| 2026-07-19 | src/modules/webhooks/router.ts | Fáza 3: POST /webhooks/keepi/payment (stav platby) a /webhooks/service-manager/timeoff | Claude |
| 2026-07-19 | src/jobs/cleanup.ts | Fáza 3: outbox worker napojený na reálny keepi sender; DB injektovateľná (Queryable) kvôli testom | Claude |
| 2026-07-19 | src/index.ts | Fáza 3: mount /webhooks + raw body verify hook pre HMAC | Claude |
| 2026-07-19 | src/config.ts, .env.example | Fáza 3: KEEPI_API_URL/KEY, KEEPI_WEBHOOK_SECRET, SERVICE_MANAGER_WEBHOOK_SECRET | Claude |
| 2026-07-19 | tests/erp.test.ts | Fáza 3: unit testy podkladu faktúry, HMAC podpisov, keepi klienta (fake fetch) | Claude |
| 2026-07-19 | tests/outbox.db.test.ts | Fáza 3: PGlite testy outbox workera (sent/retry/failed), ERP sendera a timeoff konfliktov | Claude |
| 2026-07-19 | RESERVE-SYSTEM-GIT/ | Projekt (dokumenty + rezervacny-system) commitnutý do GitHub repa | Claude |
| 2026-07-19 | RESERVE-SYSTEM-GIT/ | RESERVE-SYSTEM-GIT je odteraz HLAVNÝ repozitár projektu (zdroj pravdy); Vercel deploy napojený na main | Samuel + Claude |
| 2026-07-19 | src/modules/catalog/router.ts | Fáza 4: GET /catalog – zoznam aktívnych izieb a služieb pre web | Claude |
| 2026-07-19 | src/index.ts, src/config.ts | Fáza 4: CORS pre web origin (WEB_ORIGIN), mount /catalog | Claude |
| 2026-07-19 | src/modules/bookings/types.ts | Fáza 4: zdieľané typy booking flow vyčlenené bez runtime závislostí (type-only import z webu) | Claude |
| 2026-07-19 | web/ | Fáza 4: zákaznícky web (Next.js 14 App Router, TS) – katalóg, voľné izby, sloty služieb, hold → checkout → confirm, detail rezervácie + samoobslužné storno; server actions, API_URL len na serveri | Claude |
| 2026-07-19 | web/src/lib/api.ts | Fáza 4: typovaný API klient, typy zdieľané s backendom cez @backend/* alias | Claude |
| 2026-07-19 | RESERVE-SYSTEM-GIT/ | Layout repa: backend priamo v koreni (src/, db/, tests/, scripts/), web/ ako podzložka; zložka rezervacny-system/ z repa odstránená | Samuel + Claude |
| 2026-07-19 | scripts/init-db.mjs | Railway: idempotentná inicializácia DB schémy (pre-deploy), db:init cez node (netreba psql) | Claude |
| 2026-07-19 | railway.toml, web/railway.toml | Railway config oboch služieb (build, start, healthcheck, pre-deploy db:init) | Claude |
| 2026-07-19 | web/src/lib/booking-types.ts | Web osamostatnený: lokálna kópia typov booking flow (Root Directory = web nemôže siahať mimo zložky) | Claude |
| 2026-07-19 | web/src/app/*.tsx | force-dynamic na dátových stránkach (žiadny prerender s fetchom počas buildu) | Claude |
| 2026-07-19 | package-lock.json, web/package-lock.json | Lockfiles pre reprodukovateľný build (npm ci) | Claude |
| 2026-07-19 | package.json, railway.toml, scripts/init-db.mjs | OPRAVA: v koreni repa boli ešte staré „web-wrapper" package.json a railway.toml – preto sa root služba buildovala ako web, nie backend. Nahradené backend verziami (build `npm ci && npm run build`, pre-deploy `npm run db:init`, start `npm start`, healthcheck `/health`) + doplnený chýbajúci scripts/init-db.mjs | Claude |
| 2026-07-19 | Railway | Založený projekt (lively-tranquility), služba RESERVE-SYSTEM-GIT z GitHubu; prvý build (commit „1") padol na @backend type importe, po pushi be3651f build OK – Deployment successful | Samuel + Claude |

| 2026-07-19 | web/src/app/page.tsx, layout.tsx, globals.css | Web: úvodná stránka zobrazuje voľné izby pre najbližší termín (predvyplnené dátumy), sekcie Ubytovanie/Služby majú funkčné kotvy v menu | Claude |
| 2026-07-19 | src/modules/admin/auth.ts, src/index.ts, src/config.ts, .env.example | BEZPEČNOSŤ: `/admin/*` bolo verejne prístupné bez akejkoľvek autentifikácie. Pridaný Bearer token (`ADMIN_TOKEN`) s timing-safe porovnaním, fail-closed (bez tokenu 503, nie otvorené) | Claude |
| 2026-07-19 | src/modules/admin/bookings-router.ts | Admin API rezervácií: zoznam so stránkovaním, filtrom stavu a hľadaním (meno, e-mail, ID), detail s položkami a audit logom, ručné storno so zápisom e-mailu správcu do auditu | Claude |
| 2026-07-19 | src/modules/admin/users-router.ts | Správa správcov (len rola owner): zoznam, vytvorenie, zmena hesla/roly, deaktivácia; poistka proti vyradeniu posledného ownera; zmena hesla a deaktivácia rušia otvorené sessions | Claude |
| 2026-07-19 | web/src/app/admin/bookings/, users/, shell.tsx | Admin stránky: zoznam rezervácií s filtrami, detail s dvojkrokovým stornom, správa používateľov; spoločný rám s bočnou navigáciou podľa roly | Claude |
| 2026-07-19 | tests/admin-bookings.db.test.ts | Testy filtra rezervácií (skladanie SQL + PGlite): stav, meno, e-mail, ID, kombinácie | Claude |
| 2026-07-19 | web/src/app/(site)/, web/src/app/layout.tsx | Route group: zákaznícky web presunutý do `(site)` s vlastnou hlavičkou, koreňový layout drží len html/body (admin má vlastný vzhľad) | Claude |
| 2026-07-19 | web/src/app/admin/ | Admin UI: prihlásenie + kalendár obsadenosti (mriežka izby × dni, pruhy rezervácií, sekcia zdrojov, navigácia po týždňoch, obsadenosť v %); tmavý štýl podľa COMPONENT SITE / component-library-v2.html | Claude |
| 2026-07-19 | web/src/lib/admin-session.ts, admin-api.ts | Session token v httpOnly cookie (secure, sameSite lax, path /admin); admin API klient beží len na serveri | Claude |
| 2026-07-19 | scripts/init-db.mjs, db/migrations/ | Migračný mechanizmus: tabuľka `schema_migration`, migrácie z `db/migrations/*.sql` v samostatných transakciách; čerstvá DB dostane baseline zo `schema.sql` | Claude |
| 2026-07-19 | db/migrations/001_admin_users.sql, db/schema.sql | Tabuľky `admin_user`, `admin_session`, `admin_login_attempt`; e-mail unikátny case-insensitive | Claude |
| 2026-07-19 | src/modules/admin/password.ts | Hashovanie hesiel cez scrypt (bez natívnych závislostí), parametre uložené v hashi, timing-safe overenie | Claude |
| 2026-07-19 | src/modules/admin/sessions.ts | Prihlásenie, session tokeny (v DB len SHA-256 hash), expirácia 12 h, rate limit 5 pokusov / 15 min, rovnaká hláška pri neznámom e-maile aj zlom hesle | Claude |
| 2026-07-19 | src/modules/admin/auth.ts, auth-router.ts, src/index.ts | ADMIN_TOKEN nahradený účtami; POST /admin/auth/login, /logout, GET /admin/auth/me; requireAdmin overuje session | Claude |
| 2026-07-19 | scripts/create-admin.mjs, package.json | `npm run admin:create` – založenie/úprava správcu, heslo cez skrytý vstup alebo ADMIN_PASSWORD (nikdy v argumentoch) | Claude |
| 2026-07-19 | src/jobs/cleanup.ts | Hodinové upratovanie expirovaných sessions a starých záznamov o pokusoch | Claude |
| 2026-07-19 | tests/password.test.ts, tests/admin-auth.db.test.ts | Testy hesiel a autentifikácie (PGlite): prihlásenie, zlé heslo, uzamknutie, expirácia, odhlásenie, deaktivovaný účet | Claude |
| 2026-07-19 | tests/admin-auth.test.ts | Unit testy admin autentifikácie (parsovanie hlavičky, timing-safe porovnanie, fail-closed, 401/503) | Claude |
| 2026-07-19 | Railway | Deploy DOKONČENÝ: Postgres + backend (koreň repa, doména, PORT 8080, DATABASE_URL, WEB_ORIGIN) + web (Root Directory `web`, PORT 3000, API_URL). Schéma DB inicializovaná pre-deploy hookom, /health a /catalog odpovedajú, web beží | Samuel + Claude |

---

## Railway deploy – DOKONČENÉ (2026-07-19)

**Projekt:** `lively-tranquility` (MediaVolt AI, trial)

| Služba | Root Directory | Doména | Port |
|---|---|---|---|
| Postgres | – | interná | – |
| RESERVE-SYSTEM-GIT (backend) | prázdny (koreň) | https://reserve-system-git-production.up.railway.app | 8080 |
| protective-eagerness (web) | `web` | https://protective-eagerness-production-b5dd.up.railway.app | 3000 |

**Premenné – backend:** `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PORT=8080`, `WEB_ORIGIN=<web doména>`
**Premenné – web:** `API_URL=<backend doména>`, `PORT=3000`

**Overené:** `/health` → `{"ok":true}`; `/catalog` → `{"rooms":[],"services":[]}` (schéma vytvorená pre-deploy hookom `npm run db:init`); web sa načíta a volá backend.

**Demo dáta (2026-07-19):** `db/seed-demo.sql` – Penzión Lipa, 4 izby (2× dvojlôžková 75 €, trojlôžková 95 €, apartmán 140 € / min. 2 noci) so sezónnym cenníkom júl–august, 3 služby (masáž 60/90 min, privátna sauna), 3 zdroje (2 maséri + wellness miestnosť) s rozvrhom po–so 9:00–18:00, 2 storno politiky s pásmami. Nahraté cez Railway → Postgres → Data → Query. Overené: web zobrazí služby aj voľné izby vrátane sezónnej ceny.

**Ďalší krok:** nahradiť demo dáta reálnym katalógom (property, izby, služby, cenník, storno politiky) a dokončiť Fázu 4 (platobná brána, e-maily, zákaznícky účet). Keepi premenné (`KEEPI_API_URL`, `KEEPI_API_KEY`, `KEEPI_WEBHOOK_SECRET`, `SERVICE_MANAGER_WEBHOOK_SECRET`) zatiaľ nenastavené – bez nich adaptér len necháva eventy v outboxe. Vlastná doména neskôr. Voliteľné: premenovať službu `protective-eagerness` na `web`.

---

## Pôvodné inštrukcie pred deployom (archív, 2026-07-19)

**Stav:** Railway projekt `lively-tranquility` existuje, prvá služba `RESERVE-SYSTEM-GIT` (z GitHubu) má úspešný deploy commitu `be3651f`, zatiaľ „Unexposed" (bez domény). Postgres a druhá služba ešte nevytvorené. Beží sa zatiaľ na railway doménach (vlastná doména neskôr).

**Cieľová architektúra:** 3 služby v jednom projekte – PostgreSQL, backend (koreň repa), web (`web/`). Configy si služby čítajú z `railway.toml` (backend: build `npm ci && npm run build`, pre-deploy `npm run db:init` – idempotentne vytvorí schému, start `npm start`, healthcheck `/health`) a `web/railway.toml` (build + start Next.js, healthcheck `/`).

**Zostávajúce kroky v Railway UI:**

1. **Overiť existujúcu službu:** panel služby → Settings → Source → Root Directory. Ak je `web`, služba je web; ak prázdne, je to backend. (Druhá služba v kroku 4 dostane opačnú rolu.)
2. **Doména:** Settings → Networking → Generate Domain (spraviť pre obe repo služby).
3. **Postgres:** plátno → + Create → Database → Add PostgreSQL.
4. **Druhá služba z repa:** + Create → GitHub Repo → RESERVE-SYSTEM-GIT; Root Directory podľa kroku 1 (prázdne = backend, `web` = web).
5. **Premenné – backend:** Variables → `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `WEB_ORIGIN` = `https://<doména-webu>`; neskôr aj `KEEPI_API_URL`, `KEEPI_API_KEY`, `KEEPI_WEBHOOK_SECRET`, `SERVICE_MANAGER_WEBHOOK_SECRET` (bez KEEPI_API_URL adaptér len necháva eventy v outboxe – bezpečné).
6. **Premenné – web:** Variables → `API_URL` = `https://<doména-backendu>`.
7. **Overenie:** `https://<backend-doména>/health` vráti `{"ok":true}`; web doména zobrazí úvodnú stránku (katalóg bude prázdny, kým sa do DB nenaplnia izby/služby).

**Poznámky:** push na GitHub robí Samuel (sandbox nemá credentials). Railway po zmene Variables služby automaticky redeployne. Watch paths (backend: `src/**`, `db/**`; web: `web/**`) sú odporúčané, nie nutné. Ďalší vývojový krok po deployi: naplnenie katalógu (property/izby/služby/cenník) a dokončenie Fázy 4 (platobná brána, e-maily, účet).
