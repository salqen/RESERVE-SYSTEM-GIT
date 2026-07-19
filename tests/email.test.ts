/**
 * Testy e-mailovej vrstvy: šablóny (čisté funkcie) a mailer proti
 * podvrhnutému fetch – nič sa reálne neodosiela.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderConfirmation, renderCancellation, escapeHtml, type BookingEmailData,
} from '../src/modules/email/templates';
import { Mailer, resolveProvider, MailError } from '../src/modules/email/mailer';

const booking: BookingEmailData = {
  bookingId: '11111111-1111-1111-1111-111111111111',
  customerName: 'Ján Novák',
  totalPrice: 190,
  rooms: [{ name: 'Izba 101', checkIn: '2026-08-10', checkOut: '2026-08-12', price: 190 }],
  services: [],
  detailUrl: 'https://penzion.sk/bookings/11111111-1111-1111-1111-111111111111',
};

// --------------------------------------------------------------- šablóny

test('renderConfirmation – obsahuje meno, položky, sumu aj odkaz', () => {
  const mail = renderConfirmation(booking);
  assert.match(mail.subject, /Potvrdenie/);
  for (const part of ['Ján Novák', 'Izba 101', '190,00 €']) {
    assert.ok(mail.text.includes(part), `text má obsahovať ${part}`);
    assert.ok(mail.html.includes(part), `html má obsahovať ${part}`);
  }
  assert.ok(mail.html.includes(booking.detailUrl!));
});

test('renderConfirmation – dátumy sú v slovenskom formáte, nie ISO', () => {
  const mail = renderConfirmation(booking);
  assert.ok(mail.text.includes('10. 8. 2026'));
  assert.equal(mail.text.includes('2026-08-10'), false);
});

test('renderConfirmation – bez detailUrl nepridá prázdny odkaz', () => {
  const mail = renderConfirmation({ ...booking, detailUrl: undefined });
  assert.equal(mail.html.includes('<a href'), false);
});

test('renderConfirmation – vypíše aj služby s časom', () => {
  const mail = renderConfirmation({
    ...booking,
    services: [{ name: 'Masáž', startsAt: '2026-08-11T14:30:00.000Z', price: 45 }],
  });
  assert.ok(mail.text.includes('Masáž'));
  assert.ok(mail.text.includes('14:30'));
});

test('renderCancellation – rozlišuje vrátenie, poplatok a bezplatné storno', () => {
  const withRefund = renderCancellation({ ...booking, refundTotal: 95, feeTotal: 95 });
  assert.ok(withRefund.text.includes('95,00 €'));
  assert.ok(/vrátime/i.test(withRefund.text));

  const noRefund = renderCancellation({ ...booking, refundTotal: 0, feeTotal: 190 });
  assert.ok(/nevracia/i.test(noRefund.text));

  const free = renderCancellation({ ...booking, refundTotal: 0, feeTotal: 0 });
  assert.ok(/bez poplatku/i.test(free.text));
});

test('escapeHtml – meno so značkami sa nedostane do HTML ako kód', () => {
  const mail = renderConfirmation({ ...booking, customerName: '<script>zle()</script>' });
  assert.equal(mail.html.includes('<script>'), false);
  assert.ok(mail.html.includes('&lt;script&gt;'));
  assert.equal(escapeHtml(`"a" & 'b'`), '&quot;a&quot; &amp; &#39;b&#39;');
});

// ---------------------------------------------------------------- mailer

test('resolveProvider – bez kľúča alebo odosielateľa je vypnuté', () => {
  assert.equal(resolveProvider({ provider: 'resend', apiKey: '', from: 'a@b.sk' }), 'none');
  assert.equal(resolveProvider({ provider: 'resend', apiKey: 'key', from: '' }), 'none');
  assert.equal(resolveProvider({ provider: 'neznamy', apiKey: 'key', from: 'a@b.sk' }), 'none');
  assert.equal(resolveProvider({ provider: 'resend', apiKey: 'key', from: 'a@b.sk' }), 'resend');
  assert.equal(resolveProvider({ provider: 'postmark', apiKey: 'key', from: 'a@b.sk' }), 'postmark');
});

test('Mailer – vypnutý nič neposiela a vráti skipped', async () => {
  let called = false;
  const mailer = new Mailer(
    { provider: 'none', apiKey: '', from: '' },
    (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch,
  );
  const result = await mailer.send({ to: 'a@b.sk', subject: 's', text: 't', html: '<p>t</p>' });
  assert.equal(result.status, 'skipped');
  assert.equal(called, false, 'nesmie volať sieť');
});

test('Mailer – Resend dostane správny endpoint, hlavičku aj telo', async () => {
  let url = '', headers: any = {}, body: any = {};
  const mailer = new Mailer(
    { provider: 'resend', apiKey: 'kluc', from: 'Penzión <a@b.sk>' },
    (async (u: string, init: any) => {
      url = u; headers = init.headers; body = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
    }) as unknown as typeof fetch,
  );

  const result = await mailer.send({ to: 'host@example.sk', subject: 'Predmet', text: 't', html: '<p>t</p>' });

  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(headers.authorization, 'Bearer kluc');
  assert.deepEqual(body.to, ['host@example.sk']);
  assert.equal(body.from, 'Penzión <a@b.sk>');
  assert.equal(result.status, 'sent');
  assert.equal(result.providerId, 'msg-1');
});

test('Mailer – Postmark používa vlastnú hlavičku a názvy polí', async () => {
  let url = '', headers: any = {}, body: any = {};
  const mailer = new Mailer(
    { provider: 'postmark', apiKey: 'token', from: 'a@b.sk' },
    (async (u: string, init: any) => {
      url = u; headers = init.headers; body = JSON.parse(init.body);
      return new Response(JSON.stringify({ MessageID: 'pm-9' }), { status: 200 });
    }) as unknown as typeof fetch,
  );

  const result = await mailer.send({ to: 'host@example.sk', subject: 'Predmet', text: 't', html: '<p>t</p>' });

  assert.equal(url, 'https://api.postmarkapp.com/email');
  assert.equal(headers['X-Postmark-Server-Token'], 'token');
  assert.equal(body.To, 'host@example.sk');
  assert.equal(body.TextBody, 't');
  assert.equal(result.providerId, 'pm-9');
});

test('Mailer – chyba poskytovateľa vyhodí MailError (worker to skúsi znova)', async () => {
  const mailer = new Mailer(
    { provider: 'resend', apiKey: 'kluc', from: 'a@b.sk' },
    (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch,
  );
  await assert.rejects(
    () => mailer.send({ to: 'a@b.sk', subject: 's', text: 't', html: '<p>t</p>' }),
    (err: unknown) => err instanceof MailError,
  );
});
