/**
 * Integračné testy Fázy 3 proti PGlite (reálna schéma):
 *  - outbox worker: sent / retry s backoffom / failed po 10 pokusoch
 *  - ERP sender: podklad faktúry + uloženie erp_invoice_id
 *  - service manager: timeoff + detekcia konfliktov s rezerváciami
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { processOutbox } from '../src/jobs/cleanup';
import { makeErpSender } from '../src/modules/erp/sender';
import { KeepiClient } from '../src/modules/erp/keepi';
import { registerTimeoff } from '../src/modules/webhooks/timeoff';

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

/** Potvrdená rezervácia izba+služba + outbox event booking.confirmed. */
async function seedConfirmedBooking(db: any) {
  const prop = await db.query(`INSERT INTO property(name) VALUES('Penzión') RETURNING id`);
  const propertyId = prop.rows[0].id;
  const room = await db.query(
    `INSERT INTO room(property_id,name,room_type,price_night) VALUES($1,'Izba 1','dvojlozkova',55) RETURNING id`,
    [propertyId]);
  const res = await db.query(
    `INSERT INTO resource(property_id,name,resource_type) VALUES($1,'Masér','staff') RETURNING id`, [propertyId]);
  const svc = await db.query(
    `INSERT INTO service(property_id,name,duration_min,buffer_min,price) VALUES($1,'Masáž',60,15,40) RETURNING id`,
    [propertyId]);
  const cust = await db.query(
    `INSERT INTO customer(erp_customer_id,name,email) VALUES('ERP-42','Ján Novák','jan@x.sk') RETURNING id`);
  const b = await db.query(
    `INSERT INTO booking(customer_id,status,total_price) VALUES($1,'confirmed',260) RETURNING id`,
    [cust.rows[0].id]);
  const bookingId = b.rows[0].id;
  await db.query(
    `INSERT INTO booking_room(booking_id,room_id,stay,price,status)
     VALUES($1,$2,daterange('2026-08-01','2026-08-05'),220,'confirmed')`, [bookingId, room.rows[0].id]);
  await db.query(
    `INSERT INTO booking_service(booking_id,service_id,resource_id,time_slot,price,status)
     VALUES($1,$2,$3,tstzrange('2026-08-02T10:00:00Z','2026-08-02T11:15:00Z'),40,'confirmed')`,
    [bookingId, svc.rows[0].id, res.rows[0].id]);
  await db.query(
    `INSERT INTO sync_outbox(target,event_type,payload)
     VALUES('erp','booking.confirmed',jsonb_build_object('bookingId',$1::text))`, [bookingId]);
  return { bookingId, resourceId: res.rows[0].id, serviceId: svc.rows[0].id };
}

const fakeKeepi = (behavior: { fail?: boolean } = {}) => {
  const calls: any[] = [];
  const client = {
    createInvoiceBasis: async (basis: any) => {
      calls.push(['invoice', basis]);
      if (behavior.fail) throw new Error('keepi down');
      return { invoiceId: 'INV-77' };
    },
    registerCancellation: async (p: any) => {
      calls.push(['cancel', p]);
      if (behavior.fail) throw new Error('keepi down');
    },
  } as unknown as KeepiClient;
  return { client, calls };
};

test('outbox → keepi: booking.confirmed pošle podklad faktúry a uloží erp_invoice_id', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { bookingId } = await seedConfirmedBooking(db);

  const { client, calls } = fakeKeepi();
  await processOutbox(makeErpSender(client, db), db);

  const basis = calls[0][1];
  assert.equal(basis.bookingId, bookingId);
  assert.equal(basis.customer.erpCustomerId, 'ERP-42');
  assert.equal(basis.lines.length, 2);
  assert.equal(basis.totalPrice, 260);

  const ob = await db.query(`SELECT status FROM sync_outbox`);
  assert.equal(ob.rows[0].status, 'sent');
  const bk = await db.query(`SELECT erp_invoice_id FROM booking WHERE id=$1`, [bookingId]);
  assert.equal(bk.rows[0].erp_invoice_id, 'INV-77');
});

test('outbox: výpadok ERP → event ostáva pending s backoffom, po 10 pokusoch failed', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  await seedConfirmedBooking(db);

  const { client } = fakeKeepi({ fail: true });
  const sender = makeErpSender(client, db);
  await processOutbox(sender, db);

  let ob = await db.query(`SELECT status, attempts, next_retry > now() AS backoff FROM sync_outbox`);
  assert.equal(ob.rows[0].status, 'pending');
  assert.equal(ob.rows[0].attempts, 1);
  assert.equal(ob.rows[0].backoff, true, 'next_retry musí byť v budúcnosti');

  // ďalších 9 zlyhaní → failed (retry okno preskočíme posunutím next_retry)
  for (let i = 0; i < 9; i++) {
    await db.query(`UPDATE sync_outbox SET next_retry = now() WHERE status='pending'`);
    await processOutbox(sender, db);
  }
  ob = await db.query(`SELECT status, attempts FROM sync_outbox`);
  assert.equal(ob.rows[0].status, 'failed');
  assert.equal(ob.rows[0].attempts, 10);
});

test('outbox: booking.cancelled pošle refund/fee do keepi', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { bookingId } = await seedConfirmedBooking(db);
  await db.query(`DELETE FROM sync_outbox`);
  await db.query(
    `INSERT INTO sync_outbox(target,event_type,payload)
     VALUES('erp','booking.cancelled',jsonb_build_object('bookingId',$1::text,'refund',130,'fee',130))`,
    [bookingId]);

  const { client, calls } = fakeKeepi();
  await processOutbox(makeErpSender(client, db), db);
  assert.deepEqual(calls[0], ['cancel', { bookingId, refund: 130, fee: 130 }]);
  const ob = await db.query(`SELECT status FROM sync_outbox`);
  assert.equal(ob.rows[0].status, 'sent');
});

test('timeoff: prekrývajúca sa PN nájde konflikt, zapíše audit + notifikáciu do outboxu', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { bookingId, resourceId } = await seedConfirmedBooking(db);
  await db.query(`DELETE FROM sync_outbox`);

  // PN cez celý deň 2. 8. → koliduje so slotom 10:00–11:15
  const r = await registerTimeoff(
    { resourceId, start: '2026-08-02T00:00:00Z', end: '2026-08-03T00:00:00Z', reason: 'PN' }, db);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].bookingId, bookingId);
  assert.equal(r.conflicts[0].customerEmail, 'jan@x.sk');

  const ob = await db.query(`SELECT target, event_type, payload FROM sync_outbox`);
  assert.equal(ob.rows.length, 1);
  assert.equal(ob.rows[0].target, 'service_manager');
  assert.equal(ob.rows[0].event_type, 'timeoff.conflict');
  const audit = await db.query(`SELECT action FROM audit_log WHERE booking_id=$1`, [bookingId]);
  assert.ok(audit.rows.some((a: any) => a.action === 'timeoff_conflict'));
});

test('timeoff: neprekrývajúca sa dovolenka nemá konflikt ani notifikáciu', async (t) => {
  const db = await loadPglite();
  if (!db) return t.skip('PGlite nie je nainštalované');
  const { resourceId } = await seedConfirmedBooking(db);
  await db.query(`DELETE FROM sync_outbox`);

  const r = await registerTimeoff(
    { resourceId, start: '2026-08-10T00:00:00Z', end: '2026-08-12T00:00:00Z', reason: 'dovolenka' }, db);
  assert.equal(r.conflicts.length, 0);
  const ob = await db.query(`SELECT count(*)::int AS n FROM sync_outbox`);
  assert.equal(ob.rows[0].n, 0);
  // timeoff je zapísaný → dostupnosť slotov ho už vylúči
  const toff = await db.query(`SELECT count(*)::int AS n FROM resource_timeoff WHERE resource_id=$1`, [resourceId]);
  assert.equal(toff.rows[0].n, 1);
});
