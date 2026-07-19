/**
 * Unit testy Fázy 3 – čisté časti ERP integrácie (bez DB a bez siete):
 * podklad faktúry, HMAC podpisy webhookov, HTTP klient s fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceBasis, KeepiClient, KeepiError } from '../src/modules/erp/keepi';
import { signBody, verifySignature } from '../src/modules/webhooks/signature';

const booking = {
  id: 'b-1',
  total_price: '260.00',
  customer_name: 'Ján Novák',
  customer_email: 'jan@x.sk',
  erp_customer_id: 'ERP-42',
};

test('buildInvoiceBasis – poskladá riadky izieb aj služieb a čísla skonvertuje', () => {
  const basis = buildInvoiceBasis(
    booking,
    [{ room_name: 'Izba 1', check_in: '2026-08-01', check_out: '2026-08-05', price: '220.00' }],
    [{ service_name: 'Masáž', starts_at: '2026-08-02T10:00:00Z', ends_at: '2026-08-02T11:15:00Z', price: '40.00' }],
  );
  assert.equal(basis.bookingId, 'b-1');
  assert.equal(basis.customer.erpCustomerId, 'ERP-42');
  assert.equal(basis.totalPrice, 260);
  assert.equal(basis.currency, 'EUR');
  assert.equal(basis.lines.length, 2);
  assert.deepEqual(basis.lines.map((l) => l.type), ['room', 'service']);
  assert.equal(basis.lines[0].price, 220);
  assert.ok(basis.lines[0].from.startsWith('2026-08-01'));
});

test('buildInvoiceBasis – zákazník bez ERP ID (walk-in)', () => {
  const basis = buildInvoiceBasis({ ...booking, erp_customer_id: null }, [], []);
  assert.equal(basis.customer.erpCustomerId, undefined);
  assert.equal(basis.lines.length, 0);
});

test('podpis webhookov – valídny prejde, zmenené telo/secret nie', () => {
  const secret = 'tajne-heslo';
  const body = JSON.stringify({ invoiceId: 'INV-1', status: 'paid' });
  const sig = signBody(body, secret);
  assert.equal(verifySignature(body, sig, secret), true);
  assert.equal(verifySignature(body + ' ', sig, secret), false);
  assert.equal(verifySignature(body, sig, 'ine-heslo'), false);
  assert.equal(verifySignature(body, undefined, secret), false);
  assert.equal(verifySignature(body, sig, ''), false);        // bez nastaveného secretu nikdy neprejde
  assert.equal(verifySignature(body, 'nie-hex!', secret), false);
});

test('KeepiClient – posiela na správnu URL s API kľúčom a vracia invoiceId', async () => {
  const calls: any[] = [];
  const fakeFetch = (async (url: any, init: any) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ invoiceId: 'INV-77' }) };
  }) as unknown as typeof fetch;

  const client = new KeepiClient({ apiUrl: 'https://keepi.test/api', apiKey: 'k123' }, fakeFetch);
  const res = await client.createInvoiceBasis(buildInvoiceBasis(booking, [], []));
  assert.equal(res.invoiceId, 'INV-77');
  assert.equal(calls[0].url, 'https://keepi.test/api/invoices');
  assert.equal(calls[0].init.headers.authorization, 'Bearer k123');
  assert.equal(JSON.parse(calls[0].init.body).bookingId, 'b-1');
});

test('KeepiClient – HTTP chyba a vypnutý adaptér hádžu KeepiError (→ outbox retry)', async () => {
  const failFetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
  const client = new KeepiClient({ apiUrl: 'https://keepi.test/api', apiKey: 'k' }, failFetch);
  await assert.rejects(() => client.registerCancellation({ bookingId: 'b-1', refund: 10, fee: 5 }), KeepiError);

  const disabled = new KeepiClient({ apiUrl: '', apiKey: '' });
  assert.equal(disabled.enabled, false);
  await assert.rejects(() => disabled.createInvoiceBasis(buildInvoiceBasis(booking, [], [])), KeepiError);
});
