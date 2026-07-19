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
