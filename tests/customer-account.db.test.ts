/**
 * Testy zákazníckych účtov proti PGlite vrátane opravy duplicitných
 * zákazníkov (upsert podľa e-mailu namiesto erp_customer_id).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  register, login, logout, resolveSession, listBookings,
  purgeExpiredCustomerSessions, hashToken, AccountError,
} from '../src/modules/customers/account';

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

const PASSWORD = 'moje-tajne-heslo';

test('register – založí účet a rovno prihlási', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');

  const result = await register(db, {
    name: 'Ján Novák', email: 'novak@example.sk', password: PASSWORD,
  });
  assert.equal(result.customer.email, 'novak@example.sk');
  assert.ok(await resolveSession(db, result.token));

  const stored = await db.query('SELECT token_hash FROM customer_session');
  assert.equal(stored.rows[0].token_hash, hashToken(result.token));
});

test('register – krátke heslo odmietne', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await assert.rejects(
    () => register(db, { name: 'A', email: 'a@b.sk', password: 'kratke' }),
    (err: AccountError) => err.code === 'weak',
  );
});

test('register – druhý účet na ten istý e-mail neprejde', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await register(db, { name: 'Ján', email: 'novak@example.sk', password: PASSWORD });
  await assert.rejects(
    () => register(db, { name: 'Iný', email: 'NOVAK@example.sk', password: PASSWORD }),
    (err: AccountError) => err.code === 'exists',
  );
});

test('register – hosť bez účtu si heslo doplní a vidí staršie rezervácie', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');

  // Rezervácia spravená bez účtu
  const guest = await db.query(
    `INSERT INTO customer (name, email) VALUES ('Ján Novák','novak@example.sk') RETURNING id`);
  await db.query(
    `INSERT INTO booking (customer_id, status, total_price) VALUES ($1,'confirmed',190)`,
    [guest.rows[0].id]);

  const result = await register(db, {
    name: 'Ján Novák', email: 'novak@example.sk', password: PASSWORD,
  });

  assert.equal(result.customer.id, guest.rows[0].id, 'musí použiť existujúceho zákazníka');
  const history = await listBookings(db, result.customer.id);
  assert.equal(history.length, 1, 'staršia rezervácia má byť v histórii');
});

test('login – správne heslo prejde, zlé aj neznámy e-mail dajú rovnakú hlášku', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await register(db, { name: 'Ján', email: 'novak@example.sk', password: PASSWORD });

  const ok = await login(db, { email: 'NOVAK@example.sk', password: PASSWORD });
  assert.ok(ok.token);

  const messages: string[] = [];
  for (const creds of [
    { email: 'novak@example.sk', password: 'zle-heslo-dlhe' },
    { email: 'nikto@example.sk', password: PASSWORD },
  ]) {
    await assert.rejects(() => login(db, creds), (err: AccountError) => {
      messages.push(err.message);
      return err.code === 'invalid';
    });
  }
  assert.equal(messages[0], messages[1]);
});

test('login – zákazník bez hesla (rezervoval ako hosť) sa neprihlási', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await db.query(`INSERT INTO customer (name, email) VALUES ('Hosť','host@example.sk')`);
  await assert.rejects(
    () => login(db, { email: 'host@example.sk', password: PASSWORD }),
    (err: AccountError) => err.code === 'invalid',
  );
});

test('session – odhlásenie a expirácia zneplatnia token', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const a = await register(db, { name: 'Ján', email: 'a@example.sk', password: PASSWORD });
  const b = await login(db, { email: 'a@example.sk', password: PASSWORD });

  await logout(db, a.token);
  assert.equal(await resolveSession(db, a.token), null);
  assert.ok(await resolveSession(db, b.token), 'druhé zariadenie zostáva prihlásené');

  await db.query(`UPDATE customer_session SET expires_at = now() - interval '1 day'`);
  assert.equal(await resolveSession(db, b.token), null);

  await purgeExpiredCustomerSessions(db);
  const left = await db.query('SELECT 1 FROM customer_session');
  assert.equal(left.rows.length, 0);
});

test('listBookings – vráti len rezervácie daného zákazníka', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const mine = await register(db, { name: 'Ján', email: 'a@example.sk', password: PASSWORD });
  const other = await register(db, { name: 'Eva', email: 'b@example.sk', password: PASSWORD });

  await db.query(`INSERT INTO booking (customer_id, status, total_price) VALUES ($1,'confirmed',100)`,
    [mine.customer.id]);
  await db.query(`INSERT INTO booking (customer_id, status, total_price) VALUES ($1,'confirmed',200)`,
    [other.customer.id]);

  assert.equal((await listBookings(db, mine.customer.id)).length, 1);
});

test('unikátny index na e-mail zabráni duplicitným zákazníkom', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');

  await db.query(`INSERT INTO customer (name, email) VALUES ('Ján','novak@example.sk')`);
  await assert.rejects(
    () => db.query(`INSERT INTO customer (name, email) VALUES ('Ján znova','NOVAK@example.sk')`),
    'druhý rovnaký e-mail musí databáza odmietnuť',
  );

  // Upsert použitý v booking flow musí trafiť existujúci riadok
  const upsert = await db.query(
    `INSERT INTO customer (erp_customer_id, name, email, phone) VALUES (NULL,'Ján Novák','novak@example.sk','0900')
     ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name,
       phone = COALESCE(EXCLUDED.phone, customer.phone)
     RETURNING id`);
  const count = await db.query('SELECT count(*)::int AS n FROM customer');
  assert.equal(count.rows[0].n, 1, 'nesmie vzniknúť druhý zákazník');
  assert.ok(upsert.rows[0].id);
});
