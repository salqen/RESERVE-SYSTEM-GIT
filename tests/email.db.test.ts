/**
 * Integračné testy e-mailového sendera proti PGlite: načítanie údajov
 * rezervácie, poistka proti dvojitému odoslaniu a smerovanie outboxu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Mailer, type MailMessage } from '../src/modules/email/mailer';
import { makeEmailSender, loadBookingEmailData } from '../src/modules/email/sender';
import { makeRoutingSender } from '../src/jobs/cleanup';

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

/** Mailer, ktorý namiesto siete zbiera správy do poľa. */
function recordingMailer() {
  const sent: MailMessage[] = [];
  const mailer = new Mailer(
    { provider: 'resend', apiKey: 'kluc', from: 'a@b.sk' },
    (async (_u: string, init: any) => {
      const body = JSON.parse(init.body);
      sent.push({ to: body.to[0], subject: body.subject, text: body.text, html: body.html });
      return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 });
    }) as unknown as typeof fetch,
  );
  return { mailer, sent };
}

async function seedBooking(db: any) {
  const prop = await db.query(`INSERT INTO property(name) VALUES('Penzión') RETURNING id`);
  const room = await db.query(
    `INSERT INTO room(property_id,name,room_type,price_night) VALUES($1,'Izba 101','dvojlozkova',95) RETURNING id`,
    [prop.rows[0].id]);
  const cust = await db.query(
    `INSERT INTO customer(name,email) VALUES('Ján Novák','novak@example.sk') RETURNING id`);
  const booking = await db.query(
    `INSERT INTO booking(customer_id,status,total_price) VALUES($1,'confirmed',190) RETURNING id`,
    [cust.rows[0].id]);
  await db.query(
    `INSERT INTO booking_room(booking_id,room_id,stay,price,status)
     VALUES($1,$2,daterange('2026-08-10','2026-08-12'),190,'confirmed')`,
    [booking.rows[0].id, room.rows[0].id]);
  return booking.rows[0].id as string;
}

test('loadBookingEmailData – poskladá meno, položky, sumu aj odkaz', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const bookingId = await seedBooking(db);

  const data = await loadBookingEmailData(db, bookingId, 'https://penzion.sk/');
  assert.equal(data?.customerName, 'Ján Novák');
  assert.equal(data?.recipient, 'novak@example.sk');
  assert.equal(data?.totalPrice, 190);
  assert.equal(data?.rooms.length, 1);
  assert.equal(data?.detailUrl, `https://penzion.sk/bookings/${bookingId}`);
});

test('loadBookingEmailData – neexistujúca rezervácia vráti null', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const data = await loadBookingEmailData(db, '11111111-1111-1111-1111-111111111111', '');
  assert.equal(data, null);
});

test('email sender – odošle potvrdenie a zapíše ho do email_log', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const bookingId = await seedBooking(db);
  const { mailer, sent } = recordingMailer();

  await makeEmailSender(mailer, 'https://penzion.sk', db)(
    'email', 'booking.confirmed', { bookingId });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'novak@example.sk');
  assert.ok(sent[0].text.includes('Izba 101'));

  const log = await db.query('SELECT template, provider_id FROM email_log');
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].template, 'confirmation');
  assert.equal(log.rows[0].provider_id, 'msg-1');
});

test('email sender – opakovaný retry neposiela to isté dvakrát', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const bookingId = await seedBooking(db);
  const { mailer, sent } = recordingMailer();
  const send = makeEmailSender(mailer, 'https://penzion.sk', db);

  await send('email', 'booking.confirmed', { bookingId });
  await send('email', 'booking.confirmed', { bookingId });
  await send('email', 'booking.confirmed', { bookingId });

  assert.equal(sent.length, 1, 'zákazník má dostať potvrdenie práve raz');
});

test('email sender – storno je iná šablóna, pošle sa aj po potvrdení', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const bookingId = await seedBooking(db);
  const { mailer, sent } = recordingMailer();
  const send = makeEmailSender(mailer, 'https://penzion.sk', db);

  await send('email', 'booking.confirmed', { bookingId });
  await send('email', 'booking.cancelled', { bookingId, refund: 95, fee: 95 });

  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /Zrušenie/);
  assert.ok(sent[1].text.includes('95,00 €'));
});

test('email sender – vypnutý mailer nič nezapíše do email_log', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const bookingId = await seedBooking(db);
  const off = new Mailer({ provider: 'none', apiKey: '', from: '' });

  await makeEmailSender(off, '', db)('email', 'booking.confirmed', { bookingId });

  const log = await db.query('SELECT 1 FROM email_log');
  assert.equal(log.rows.length, 0);
});

test('potvrdenie rezervácie zaradí event pre ERP aj pre e-mail', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je k dispozícii');
  const bookingId = await seedBooking(db);

  await db.query(
    `INSERT INTO sync_outbox (target, event_type, payload)
     SELECT t, 'booking.confirmed', jsonb_build_object('bookingId', $1::text)
       FROM unnest(ARRAY['erp','email']) AS t`,
    [bookingId],
  );

  const rows = await db.query(`SELECT target FROM sync_outbox ORDER BY target`);
  assert.deepEqual(rows.rows.map((r: any) => r.target), ['email', 'erp']);
});

test('routing sender – pošle event len príslušnému senderu', async (t) => {
  const seen: string[] = [];
  const router = makeRoutingSender({
    erp: async () => { seen.push('erp'); },
    email: async () => { seen.push('email'); },
  });

  await router('erp', 'booking.confirmed', {});
  await router('email', 'booking.confirmed', {});
  await router('service_manager', 'timeoff.conflict', {}); // bez sendera – len log

  assert.deepEqual(seen, ['erp', 'email']);
});
