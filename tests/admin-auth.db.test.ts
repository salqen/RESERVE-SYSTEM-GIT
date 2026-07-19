/**
 * Integračné testy admin autentifikácie proti PGlite (reálna schéma):
 * prihlásenie, nesprávne heslo, uzamknutie po opakovaných pokusoch,
 * overenie a expirácia session, odhlásenie, deaktivovaný účet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hashPassword } from '../src/modules/admin/password';
import {
  login, logout, resolveSession, purgeExpired, hashToken, generateToken,
  tokenHashEquals, LoginError, MAX_FAILED_ATTEMPTS,
} from '../src/modules/admin/sessions';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');

async function loadPglite() {
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
    const db = new (PGlite as any)({ extensions: { btree_gist } });
    const sql = schemaSql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;[^\n]*\n/, '');
    await db.exec(sql);
    return db;
  } catch {
    return null;
  }
}

const PASSWORD = 'spravne-heslo-123';

async function seedUser(db: any, over: { email?: string; active?: boolean } = {}) {
  const email = over.email ?? 'sef@penzion.sk';
  const hash = await hashPassword(PASSWORD);
  const r = await db.query(
    `INSERT INTO admin_user (email, name, password_hash, role, active)
     VALUES ($1, 'Šéf', $2, 'owner', $3) RETURNING id`,
    [email, hash, over.active ?? true],
  );
  return { id: r.rows[0].id, email };
}

// ------------------------------------------------------------ čisté funkcie

test('hashToken – rovnaký vstup dá rovnaký hash, iný vstup iný', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('abd'));
  assert.equal(hashToken('abc').length, 64);
});

test('generateToken – dostatočne dlhý a zakaždým iný', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40, 'token má byť aspoň 40 znakov');
});

test('tokenHashEquals – porovnáva hashy, zvládne aj nezmysly', () => {
  assert.equal(tokenHashEquals(hashToken('x'), hashToken('x')), true);
  assert.equal(tokenHashEquals(hashToken('x'), hashToken('y')), false);
  assert.equal(tokenHashEquals('', ''), false);
  assert.equal(tokenHashEquals('zz', hashToken('x')), false);
});

// ----------------------------------------------------------- proti databáze

test('login – správne údaje vrátia token a použiteľnú session', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  const result = await login(db, { email: 'sef@penzion.sk', password: PASSWORD });
  assert.equal(result.user.email, 'sef@penzion.sk');
  assert.equal(result.user.role, 'owner');
  assert.ok(result.expiresAt > new Date());

  const user = await resolveSession(db, result.token);
  assert.equal(user?.email, 'sef@penzion.sk');

  // V DB smie byť len hash tokenu, nikdy nie token samotný.
  const stored = await db.query('SELECT token_hash FROM admin_session');
  assert.equal(stored.rows[0].token_hash, hashToken(result.token));
  assert.notEqual(stored.rows[0].token_hash, result.token);
});

test('login – e-mail je case-insensitive', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  const result = await login(db, { email: 'SEF@Penzion.SK', password: PASSWORD });
  assert.ok(result.token);
});

test('login – nesprávne heslo aj neznámy e-mail dajú rovnakú hlášku', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  const messages: string[] = [];
  for (const creds of [
    { email: 'sef@penzion.sk', password: 'zle-heslo-123456' },
    { email: 'neznamy@penzion.sk', password: PASSWORD },
  ]) {
    await assert.rejects(
      () => login(db, creds),
      (err: LoginError) => { messages.push(err.message); return err.code === 'invalid'; },
    );
  }
  assert.equal(messages[0], messages[1], 'hlášky sa nesmú líšiť');
});

test('login – po piatich neúspechoch je účet dočasne uzamknutý', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
    await assert.rejects(() => login(db, { email: 'sef@penzion.sk', password: 'zle-heslo-123456' }));
  }
  // Aj so správnym heslom je teraz zamknuté.
  await assert.rejects(
    () => login(db, { email: 'sef@penzion.sk', password: PASSWORD }),
    (err: LoginError) => err.code === 'locked',
  );
});

test('login – deaktivovaný účet sa neprihlási', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db, { active: false });

  await assert.rejects(
    () => login(db, { email: 'sef@penzion.sk', password: PASSWORD }),
    (err: LoginError) => err.code === 'inactive',
  );
});

test('resolveSession – neplatný token a expirovaná session vrátia null', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  assert.equal(await resolveSession(db, 'vymysleny-token'), null);
  assert.equal(await resolveSession(db, ''), null);

  const { token } = await login(db, { email: 'sef@penzion.sk', password: PASSWORD });
  await db.query(`UPDATE admin_session SET expires_at = now() - interval '1 hour'`);
  assert.equal(await resolveSession(db, token), null);
});

test('resolveSession – deaktivovanie účtu okamžite zneplatní session', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const user = await seedUser(db);

  const { token } = await login(db, { email: user.email, password: PASSWORD });
  assert.ok(await resolveSession(db, token));

  await db.query('UPDATE admin_user SET active = false WHERE id = $1', [user.id]);
  assert.equal(await resolveSession(db, token), null);
});

test('logout – zmaže len vlastnú session, ostatné nechá', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  const first = await login(db, { email: 'sef@penzion.sk', password: PASSWORD });
  const second = await login(db, { email: 'sef@penzion.sk', password: PASSWORD });

  await logout(db, first.token);
  assert.equal(await resolveSession(db, first.token), null);
  assert.ok(await resolveSession(db, second.token), 'druhá session má prežiť');
});

test('purgeExpired – odstráni expirované sessions, platné nechá', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  await seedUser(db);

  const live = await login(db, { email: 'sef@penzion.sk', password: PASSWORD });
  await db.query(
    `INSERT INTO admin_session (user_id, token_hash, expires_at)
     SELECT id, 'stary-hash', now() - interval '1 day' FROM admin_user LIMIT 1`,
  );

  await purgeExpired(db);
  const left = await db.query('SELECT token_hash FROM admin_session');
  assert.equal(left.rows.length, 1);
  assert.equal(left.rows[0].token_hash, hashToken(live.token));
});
