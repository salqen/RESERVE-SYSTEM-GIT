/**
 * Testy admin zoznamu rezervácií: skladanie filtra (čistá funkcia) a jeho
 * chovanie proti reálnej schéme v PGlite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildBookingFilter } from '../src/modules/admin/bookings-router';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');

async function loadPglite() {
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
    const db = new (PGlite as any)({ extensions: { btree_gist } });
    await db.exec(schemaSql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;[^\n]*\n/, ''));
    return db;
  } catch {
    return null;
  }
}

// --------------------------------------------------------- skladanie filtra

test('buildBookingFilter – bez filtra nevytvorí WHERE', () => {
  const { whereSql, params } = buildBookingFilter({});
  assert.equal(whereSql, '');
  assert.deepEqual(params, []);
});

test('buildBookingFilter – status a text sa spoja cez AND, indexy sedia', () => {
  const { whereSql, params } = buildBookingFilter({ status: 'confirmed', q: 'Novák' });
  assert.match(whereSql, /^WHERE /);
  assert.match(whereSql, /b\.status = \$1/);
  assert.match(whereSql, /\$2/);
  assert.deepEqual(params, ['confirmed', '%Novák%']);
});

test('buildBookingFilter – bežný text nehľadá podľa ID (cast by padol)', () => {
  const { whereSql } = buildBookingFilter({ q: 'Novák' });
  assert.equal(whereSql.includes('b.id::text'), false);
});

test('buildBookingFilter – vstup podobný UUID hľadá aj podľa ID', () => {
  const { whereSql } = buildBookingFilter({ q: '3fa8' });
  assert.ok(whereSql.includes('b.id::text LIKE $1'));
});

// ----------------------------------------------------------- proti databáze

async function seed(db: any) {
  const prop = await db.query(`INSERT INTO property(name) VALUES('Penzión') RETURNING id`);
  const room = await db.query(
    `INSERT INTO room(property_id,name,room_type,price_night) VALUES($1,'Izba 1','dvojlozkova',75) RETURNING id`,
    [prop.rows[0].id]);

  // Termíny sa nesmú prekrývať – exclusion constraint na (room_id, stay)
  // by druhý zápis odmietol, presne ako v produkcii.
  const guests: [string, string, string, string, string][] = [
    ['Ján Novák', 'novak@example.sk', 'confirmed', '2026-08-10', '2026-08-12'],
    ['Eva Kováčová', 'kovacova@example.sk', 'cancelled', '2026-08-14', '2026-08-16'],
    ['Peter Horváth', 'horvath@example.sk', 'confirmed', '2026-08-18', '2026-08-20'],
  ];

  for (const [name, email, status, from, to] of guests) {
    const c = await db.query(
      `INSERT INTO customer(name,email) VALUES($1,$2) RETURNING id`, [name, email]);
    const b = await db.query(
      `INSERT INTO booking(customer_id,status,total_price) VALUES($1,$2,150) RETURNING id`,
      [c.rows[0].id, status]);
    await db.query(
      `INSERT INTO booking_room(booking_id,room_id,stay,price,status)
       VALUES($1,$2,daterange($3::date,$4::date),150,$5)`,
      [b.rows[0].id, room.rows[0].id, from, to, status === 'cancelled' ? 'cancelled' : 'confirmed'],
    );
  }
}

/** Spustí zoznam rovnakým spôsobom ako router. */
async function runList(db: any, filter: { q?: string; status?: string }) {
  const { whereSql, params } = buildBookingFilter(filter);
  const r = await db.query(
    `SELECT b.id, b.status, c.name AS customer_name
       FROM booking b JOIN customer c ON c.id = b.customer_id
       ${whereSql} ORDER BY c.name`,
    params,
  );
  return r.rows;
}

test('zoznam – bez filtra vráti všetky rezervácie', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);
  assert.equal((await runList(db, {})).length, 3);
});

test('zoznam – filter podľa stavu', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);

  const confirmed = await runList(db, { status: 'confirmed' });
  assert.equal(confirmed.length, 2);
  assert.ok(confirmed.every((r: any) => r.status === 'confirmed'));

  assert.equal((await runList(db, { status: 'cancelled' })).length, 1);
});

test('zoznam – hľadanie podľa mena je case-insensitive a čiastkové', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);

  assert.equal((await runList(db, { q: 'novák' }))[0].customer_name, 'Ján Novák');
  assert.equal((await runList(db, { q: 'NOVÁK' })).length, 1);
  assert.equal((await runList(db, { q: 'ová' })).length, 2); // Kováčová + Horváth
});

test('zoznam – hľadanie podľa e-mailu', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);
  assert.equal((await runList(db, { q: 'horvath@example.sk' })).length, 1);
});

test('zoznam – text a stav sa kombinujú', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);

  assert.equal((await runList(db, { q: 'ová', status: 'confirmed' })).length, 1);
  assert.equal((await runList(db, { q: 'ová', status: 'cancelled' })).length, 1);
});

test('zoznam – hľadanie podľa ID rezervácie nespadne', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);

  const any = await db.query('SELECT id FROM booking LIMIT 1');
  const prefix = String(any.rows[0].id).slice(0, 8);
  const found = await runList(db, { q: prefix });
  assert.equal(found.length, 1);
});

test('zoznam – neznámy výraz vráti prázdny zoznam, nie chybu', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seed(db);
  assert.equal((await runList(db, { q: 'nikto-taky-neexistuje' })).length, 0);
});
