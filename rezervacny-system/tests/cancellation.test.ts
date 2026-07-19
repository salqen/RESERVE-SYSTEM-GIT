import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refundPctFor, refundForItem, CancellationTier } from '../src/modules/bookings/cancellation';

const tiers: CancellationTier[] = [
  { hoursBefore: 168, refundPct: 100 }, // >= 7 dní: plné vrátenie
  { hoursBefore: 48, refundPct: 50 },   // >= 48 h: polovica
  { hoursBefore: 24, refundPct: 20 },   // >= 24 h: 20 %
];

const start = new Date('2026-08-10T10:00:00Z');

test('refundPctFor – vyberá najvyššie splnené pásmo (skoré storno = viac)', () => {
  // 10 dní vopred → 100 %
  assert.equal(refundPctFor(start, new Date('2026-07-31T10:00:00Z'), tiers), 100);
  // 3 dni vopred (72 h) → 50 %
  assert.equal(refundPctFor(start, new Date('2026-08-07T10:00:00Z'), tiers), 50);
  // 30 h vopred → 20 %
  assert.equal(refundPctFor(start, new Date('2026-08-09T04:00:00Z'), tiers), 20);
});

test('refundPctFor – pod najnižším pásmom = 0 %', () => {
  // 5 h vopred → žiadne pásmo → 0 %
  assert.equal(refundPctFor(start, new Date('2026-08-10T05:00:00Z'), tiers), 0);
});

test('refundPctFor – prázdna politika = 0 %', () => {
  assert.equal(refundPctFor(start, new Date('2026-07-01T00:00:00Z'), []), 0);
});

test('refundForItem – rozpočíta vrátenie a poplatok', () => {
  const line = refundForItem(200, start, new Date('2026-08-07T10:00:00Z'), tiers); // 50 %
  assert.deepEqual(line, { price: 200, refund: 100, fee: 100, refundPct: 50 });
});

test('refundForItem – zaokrúhľuje na centy', () => {
  const line = refundForItem(99.99, start, new Date('2026-08-09T04:00:00Z'), tiers); // 20 %
  assert.equal(line.refundPct, 20);
  assert.equal(line.refund, 20.0); // round(99.99 * 20)/100 = round(1999.8)/100 = 2000/100 = 20.00
  assert.equal(Math.round((line.refund + line.fee) * 100) / 100, 99.99);
});
