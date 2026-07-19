/**
 * Čistá logika storna – bez závislosti na DB (pokryté unit testami).
 *
 * Pásmo (tier) hovorí: ak zákazník ruší aspoň `hoursBefore` hodín pred
 * začiatkom položky, vráti sa mu `refundPct` % z ceny. Vyberá sa pásmo
 * s najväčším splneným `hoursBefore` (t.j. čím skôr ruší, tým viac dostane).
 * Ak sa nesplní žiadne pásmo, refund je 0 % (plný storno poplatok).
 */

export interface CancellationTier {
  hoursBefore: number;
  refundPct: number;
}

export interface RefundLine {
  price: number;
  refund: number;
  fee: number;
  refundPct: number;
}

/** Vráti percento vrátenia pre danú položku pri storne v čase `now`. */
export function refundPctFor(
  startsAt: Date,
  now: Date,
  tiers: CancellationTier[],
): number {
  const hoursUntilStart = (startsAt.getTime() - now.getTime()) / 3_600_000;
  let pct = 0;
  let bestThreshold = -1;
  for (const t of tiers) {
    if (hoursUntilStart >= t.hoursBefore && t.hoursBefore > bestThreshold) {
      bestThreshold = t.hoursBefore;
      pct = t.refundPct;
    }
  }
  return pct;
}

/** Vypočíta vrátenú sumu a storno poplatok pre jednu položku. */
export function refundForItem(
  price: number,
  startsAt: Date,
  now: Date,
  tiers: CancellationTier[],
): RefundLine {
  const pct = refundPctFor(startsAt, now, tiers);
  const refund = Math.round(price * pct) / 100;
  return { price, refund, fee: Math.round((price - refund) * 100) / 100, refundPct: pct };
}
