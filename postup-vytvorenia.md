# Postup vytvorenia rezervačného systému

Vychádza z `rezervacny-system-navrh.md`. Zohľadňuje existujúci ERP (keepi-erp: Express + Upstash Redis, Vercel).

---

## Fáza 0 – Rozhodnutia pred kódom (1–2 dni)

Zodpovedať otvorené otázky z návrhu, bez ktorých sa nedá správne navrhnúť dátový model:

1. **Master dát zákazníka** – odporúčanie: ERP je zdroj pravdy, rezervačný systém drží len referenciu (`customer_id`).
2. **Balíčky** – odporúčanie: jedna rezervácia s viacerými položkami (izba + služby); jednoduchšie účtovanie aj storno.
3. **Fakturácia** – rezervácia posiela podklad do ERP cez API (real-time), stavy platieb späť webhookom/pollingom.
4. **Stack** – návrh odporúča NestJS + PostgreSQL + NATS. Keďže existujúci ERP je jednoduchý Express na Verceli, pragmatickejšia verzia: **Express/Fastify + TypeScript + PostgreSQL (Neon/Supabase) + Upstash Redis**. Message queue (NATS/Kafka) v prvej verzii vynechať, nahradiť retry frontou v DB.

## Fáza 1 – Jadro: dátový model + availability engine (2–3 týždne)

Najrizikovejšia časť, robiť ako prvú:

- PostgreSQL schéma: prevádzka, izby, služby, zdroje, rezervácia (hlavička + položky), cenník
- **Ubytovanie**: exclusion constraint na `(room_id, daterange)` – double-booking zablokuje priamo DB
- **Služby**: exclusion constraint na `(resource_id, tstzrange)` vrátane buffer časov
- Jednotný endpoint `GET /availability` nad oboma enginmi
- Dočasný zámok termínu (Redis, TTL 10–15 min) pre booking flow
- Testy na race conditions (paralelné requesty na ten istý termín)

## Fáza 2 – Booking flow + admin (2–3 týždne)

- API: vytvorenie/zmena/storno rezervácie, idempotency key na každý zápis
- Cenové pravidlá (sezóny, min. dĺžka pobytu, storno podmienky)
- Jednoduchý admin kalendár (obsadenosť izieb + slotov zdrojov)
- Audit log zmien rezervácie

## Fáza 3 – Integrácie (2 týždne)

- **ERP**: adaptér na keepi (podklad faktúry, stav platby); pri výpadku ERP rezervácia prejde a synchronizuje sa dodatočne (retry tabuľka)
- **Service manager**: príjem zmien dostupnosti personálu; konflikt s existujúcou rezerváciou → notifikácia + manuálne riešenie (automatický presun až v ďalšej verzii)

## Fáza 4 – Zákaznícky web (2–3 týždne)

- Next.js + TypeScript, zdieľané typy s backendom
- Booking flow: výber termínu → zámok → platobná brána → potvrdenie e-mailom
- Zákaznícky účet, história, samoobslužné storno podľa podmienok

## Fáza 5 – Prevádzka

- Notifikácie/pripomienky, čakacie listiny, skupinové rezervácie
- Monitoring, GDPR (retencia dát), záťažový test na sezónnu špičku

---

**Kľúčový princíp:** ochrana proti double-bookingu sa rieši v databáze (exclusion constraints), nie v aplikačnom kóde – potom je jedno, koľko inštancií beží.

---

## Stav implementácie (2026-07-19)

- **Fáza 1 – hotová:** schéma (`db/schema.sql`), exclusion constraints na izby aj sloty zdrojov, `GET /availability`, dočasný hold (DB, TTL), integračné race-condition testy proti PGlite (`tests/booking.db.test.ts`) – 5 paralelných holdov na ten istý termín → prejde práve jeden.
- **Fáza 2 – hotová:** booking flow (hold/confirm/cancel, idempotency, audit), sezónne ceny (`room_price_rule`), **storno politiky** (`cancellation_policy`/`cancellation_tier` + výpočet refundu podľa času do začiatku), **admin kalendár** (`GET /admin/calendar`).
- **Fáza 3 – hotová:** adaptér na keepi ERP (`src/modules/erp/` – podklad faktúry z `booking.confirmed`, refund/fee z `booking.cancelled`, `erp_invoice_id` na bookingu), outbox worker s exponenciálnym backoffom napojený na reálny sender; webhooky (`src/modules/webhooks/`) s HMAC-SHA256 podpisom: `POST /webhooks/keepi/payment` (stav platby → `booking.payment_status`) a `POST /webhooks/service-manager/timeoff` (zápis PN/dovolenky + detekcia konfliktov s rezerváciami → audit + notifikácia `timeoff.conflict` do outboxu, manuálne riešenie).
- **Overené:** `tsc --noEmit` bez chýb, `npm test` = 26/26 OK.
- **Ďalej:** Fáza 4 – zákaznícky web (Next.js), potom Fáza 5 (prevádzka).
- **Git:** projekt je verzovaný v `RESERVE-SYSTEM-GIT/` (GitHub: salqen/RESERVE-SYSTEM-GIT).

> Pozn.: pridaný dev dependency `@electric-sql/pglite`; po pull-e spusti `npm install`.
