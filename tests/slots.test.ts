import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFreeSlots, overlaps } from '../src/modules/availability/slots';

const d = (s: string) => new Date(`2026-08-01T${s}:00Z`);

test('overlaps – deteguje prekrytie a susedné intervaly neprekrýva', () => {
  assert.equal(overlaps({ start: d('10:00'), end: d('11:00') }, { start: d('10:30'), end: d('11:30') }), true);
  assert.equal(overlaps({ start: d('10:00'), end: d('11:00') }, { start: d('11:00'), end: d('12:00') }), false);
});

test('computeFreeSlots – prázdny kalendár ponúkne celé okno', () => {
  const slots = computeFreeSlots({ start: d('08:00'), end: d('10:00') }, [], 60, 30);
  // 60-min slot v okne 08:00–10:00 s krokom 30: 08:00, 08:30, 09:00
  assert.deepEqual(slots.map((s) => s.toISOString()), [
    d('08:00').toISOString(), d('08:30').toISOString(), d('09:00').toISOString(),
  ]);
});

test('computeFreeSlots – obsadený stred vyradí kolidujúce začiatky', () => {
  const busy = [{ start: d('08:30'), end: d('09:00') }];
  const slots = computeFreeSlots({ start: d('08:00'), end: d('10:00') }, busy, 60, 30);
  // 08:00 koliduje (08:00–09:00 && 08:30–09:00), 08:30 koliduje, 09:00 voľný
  assert.deepEqual(slots.map((s) => s.toISOString()), [d('09:00').toISOString()]);
});

test('computeFreeSlots – slot sa nezmestí za koniec okna', () => {
  const slots = computeFreeSlots({ start: d('08:00'), end: d('09:00') }, [], 90, 15);
  assert.equal(slots.length, 0);
});

test('computeFreeSlots – buffer je súčasťou slotu (slotMin = duration + buffer)', () => {
  // služba 45 min + 15 min buffer = 60; existujúca rezervácia 09:00–10:00
  const busy = [{ start: d('09:00'), end: d('10:00') }];
  const slots = computeFreeSlots({ start: d('08:00'), end: d('12:00') }, busy, 60, 60);
  assert.deepEqual(slots.map((s) => s.toISOString()), [
    d('08:00').toISOString(), d('10:00').toISOString(), d('11:00').toISOString(),
  ]);
});
