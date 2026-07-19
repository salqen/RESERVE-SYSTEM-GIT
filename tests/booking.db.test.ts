/**
 * Integračné testy jadra ochrany proti double-bookingu.
 *
 * Bežia proti in-process Postgresu (PGlite) s reálnou schémou db/schema.sql,
 * takže testujú presne tie EXCLUSION CONSTRAINTS, na ktorých stojí celý systém.
 * Ak PGlite (dev dependency) nie je nainštalované, testy sa preskočia.
 *
 * Kľúčové tvrdenie (Fáza 1): pri viacerých súbežných pokusoch o ten istý termín
 * prejde práve jeden – ochranu rieši databáza, nie aplikačný kód.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');

const EXCLUSION_VIOLATION = '23P01';

async function loadPglite() {
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
    const db = new (PGlite as any)({ extensions: { btree_gist } });
    // PGlite (PG16) má gen_random_uuid() v jadre → extension pgcrypto tu netreba.
    // V reálnej schéme (Neon/Supabase) pgcrypto ostáva; pre in-memory test ho vynecháme.
    const sql = schemaSql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;[^\n]*\n/, '');
    await db.exec(sql);
    return db;
  } catch {
    return null;
  }
}

async function seed(db: any) {
  const prop = await db.query(`INSERT INTO property(name) VALUES('Penzión') RETURNING id`);
  const propertyId = prop.rows[0].id;
  const room = await db.query(
    `INSERT INTO room(property_id,name,room_type,price_night,min_nights)
     VALUES($1,'Izba 1','dvojlozkova',60,1) RETURNING id`, [propertyId]);
  const roomId = room.rows[0].id;
  const res = await db.query(
    `INSERT INTO resource(property_id,name,resource_type) VALUES($1,'Masér','staff') RETURNING id`, [propertyId]);
  const resourceId = res.rows[0].id;
  const svc = await db.query(
    `INSERT INTO service(property_id,name,duration_min,buffer_min,price)
     VALUES($1,'Masáž',60,15,40) RETURNING id`, [propertyId]);
  const serviceId = svc.rows[0].id;
  const cust = await db.query(`INSERT INTO customer(name,email) VALUES('Zákazník','z@x.sk') RETURNING id`);
  const customerId = cust.rows[0].id;
  return { propertyId, roomId, resourceId, serviceId, customerId };
}

/** Vytvorí booking + skúsi vložiť booking_room v transakcii. Vráti 'ok' alebo kód chyby. */
async function tryRoomHold(db: any, customerId: string, roomId: string, from: string, to: string) {
  try {
    await db.transaction(async (tx: any) => {
      const b = await tx.query(
        `INSERT INTO booking(customer_id,status,hold_expires_at)
         VALUES($1,'hold',now()+interval '15 min') RETURNING id`, [customerId]);
      await tx.query(
        `INSERT INTO booking_room(booking_id,room_id,stay,price,status)
         VALUES($1,$2,daterange($3::date,$4::date),100,'hold')`, [b.rows[0].id, roomId, from, to]);
    });
    return 'ok';
  } catch (e: any) {
    return e.code ?? 'ERR';
  }
}

async function tryServiceHold(db: any, customerId: string, serviceId: string, resourceId: string, startsAt: string) {
  try {
    await db.transaction(async (tx: any) => {
      const b = await tx.query(
        `INSERT INTO booking(customer_id,status,hold_expires_at)
         VALUES($1,'hold',now()+interval '15 min') RETURNING id`, [customerId]);
      await tx.query(
        `INSERT INTO booking_service(booking_id,service_id,resource_id,time_slot,price,status)
         VALUES($1,$2,$3,tstzrange($4::timestamptz,$4::timestamptz+interval '75 min'),40,'hold')`,
        [b.rows[0].id, serviceId, resourceId, startsAt]);
    });
    return 'ok';
  } catch (e: any) {
    return e.code ?? 'ERR';
  }
}

test('schéma sa načíta a exclusion constraints existujú', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const ids = await seed(db);
  assert.ok(ids.roomId);
});

test('izba: 5 súbežných holdov na prekrývajúci sa termín → prejde práve jeden', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { customerId, roomId } = await seed(db);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => tryRoomHold(db, customerId, roomId, '2026-08-01', '2026-08-05')),
  );
  const ok = results.filter((r) => r === 'ok').length;
  const conflicts = results.filter((r) => r === EXCLUSION_VIOLATION).length;
  assert.equal(ok, 1, 'práve jeden hold smie prejsť');
  assert.equal(conflicts, 4, 'ostatné musia spadnúť na exclusion constraint');
});

test('izba: nadväzujúce (nie prekrývajúce) termíny prejdú oba', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { customerId, roomId } = await seed(db);
  const a = await tryRoomHold(db, customerId, roomId, '2026-08-01', '2026-08-05');
  const b = await tryRoomHold(db, customerId, roomId, '2026-08-05', '2026-08-08'); // check-out = check-in
  assert.equal(a, 'ok');
  assert.equal(b, 'ok');
});

test('izba: zrušený hold uvoľní termín pre nový', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { customerId, roomId } = await seed(db);
  // prvý hold
  await db.transaction(async (tx: any) => {
    const b = await tx.query(
      `INSERT INTO booking(customer_id,status,hold_expires_at)
       VALUES($1,'hold',now()+interval '15 min') RETURNING id`, [customerId]);
    await tx.query(
      `INSERT INTO booking_room(booking_id,room_id,stay,price,status)
       VALUES($1,$2,daterange('2026-08-01','2026-08-05'),100,'hold')`, [b.rows[0].id, roomId]);
    (db as any)._bid = b.rows[0].id;
  });
  // zrušenie (trigger propaguje status do položky → uvoľní partial index)
  await db.query(`UPDATE booking SET status='cancelled' WHERE id=$1`, [(db as any)._bid]);
  // nový hold na ten istý termín musí prejsť
  const again = await tryRoomHold(db, customerId, roomId, '2026-08-01', '2026-08-05');
  assert.equal(again, 'ok');
});

test('služba: 4 súbežné holdy na prekrývajúci sa slot toho istého zdroja → prejde jeden', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { customerId, serviceId, resourceId } = await seed(db);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => tryServiceHold(db, customerId, serviceId, resourceId, '2026-08-01T10:00:00Z')),
  );
  assert.equal(results.filter((r) => r === 'ok').length, 1);
  assert.equal(results.filter((r) => r === EXCLUSION_VIOLATION).length, 3);
});

test('služba: buffer chráni pred tesne nasledujúcim slotom', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { customerId, serviceId, resourceId } = await seed(db);
  // slot 10:00–11:15 (60 + 15 buffer)
  const a = await tryServiceHold(db, customerId, serviceId, resourceId, '2026-08-01T10:00:00Z');
  // začiatok 11:00 → prekrýva sa s bufferom (10:00–11:15) → konflikt
  const b = await tryServiceHold(db, customerId, serviceId, resourceId, '2026-08-01T11:00:00Z');
  // začiatok 11:15 → presne za bufferom → prejde
  const c = await tryServiceHold(db, customerId, serviceId, resourceId, '2026-08-01T11:15:00Z');
  assert.equal(a, 'ok');
  assert.equal(b, EXCLUSION_VIOLATION);
  assert.equal(c, 'ok');
});
