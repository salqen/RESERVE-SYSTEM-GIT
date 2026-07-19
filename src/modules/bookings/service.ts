import { PoolClient } from 'pg';
import { withTransaction, EXCLUSION_VIOLATION, UNIQUE_VIOLATION } from '../../db';
import { config } from '../../config';
import { refundForItem, CancellationTier, RefundLine } from './cancellation';

export class ConflictError extends Error {}       // termín je obsadený
export class DuplicateRequestError extends Error {} // rovnaký idempotency key

// Zdieľané typy (aj pre web) – src/modules/bookings/types.ts
export type { RoomItem, ServiceItem, CreateHoldInput } from './types';
import type { CreateHoldInput } from './types';

async function audit(client: PoolClient, bookingId: string | null, actor: string, action: string, detail: unknown) {
  await client.query(
    `INSERT INTO audit_log (booking_id, actor, action, detail) VALUES ($1,$2,$3,$4)`,
    [bookingId, actor, action, JSON.stringify(detail)],
  );
}

/**
 * Krok 1 booking flow: vytvorí HOLD – dočasnú rezerváciu so zámkom termínu.
 * Exclusion constraints v DB zaručia, že dvaja zákazníci nezarezervujú to isté,
 * nech beží koľkokoľvek inštancií servera.
 */
export async function createHold(input: CreateHoldInput) {
  try {
    return await withTransaction(async (client) => {
      // Zákazník: upsert podľa e-mailu (master dát je ERP, tu len kontakt)
      const cust = await client.query(
        `INSERT INTO customer (erp_customer_id, name, email, phone)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (erp_customer_id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [input.customer.erpCustomerId ?? null, input.customer.name, input.customer.email, input.customer.phone ?? null],
      );
      const customerId = cust.rows[0].id;

      const booking = await client.query(
        `INSERT INTO booking (customer_id, status, hold_expires_at, idempotency_key, note)
         VALUES ($1, 'hold', now() + make_interval(mins => $2), $3, $4)
         RETURNING id, hold_expires_at`,
        [customerId, config.holdTtlMinutes, input.idempotencyKey, input.note ?? null],
      );
      const bookingId = booking.rows[0].id;
      let total = 0;

      for (const r of input.rooms) {
        const price = await client.query(
          `SELECT (COALESCE(pr.price_night, rm.price_night)
                   * ($3::date - $2::date)) AS price, rm.min_nights,
                  rm.cancellation_policy_id
             FROM room rm
             LEFT JOIN room_price_rule pr ON pr.room_id = rm.id AND pr.season @> $2::date
            WHERE rm.id = $1`,
          [r.roomId, r.checkIn, r.checkOut],
        );
        if (price.rowCount === 0) throw new Error(`Izba ${r.roomId} neexistuje`);
        const nights = (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86_400_000;
        if (nights < price.rows[0].min_nights) {
          throw new ConflictError(`Minimálna dĺžka pobytu je ${price.rows[0].min_nights} nocí`);
        }
        // Tu môže spadnúť EXCLUSION_VIOLATION → termín obsadený
        await client.query(
          `INSERT INTO booking_room (booking_id, room_id, stay, price, cancellation_policy_id, status)
           VALUES ($1, $2, daterange($3::date, $4::date), $5, $6, 'hold')`,
          [bookingId, r.roomId, r.checkIn, r.checkOut, price.rows[0].price, price.rows[0].cancellation_policy_id],
        );
        total += Number(price.rows[0].price);
      }

      for (const s of input.services) {
        const svc = await client.query(
          `SELECT duration_min, buffer_min, price, cancellation_policy_id FROM service WHERE id = $1 AND active`,
          [s.serviceId],
        );
        if (svc.rowCount === 0) throw new Error(`Služba ${s.serviceId} neexistuje`);
        const { duration_min, buffer_min, price, cancellation_policy_id } = svc.rows[0];
        // Tu môže spadnúť EXCLUSION_VIOLATION → slot obsadený
        await client.query(
          `INSERT INTO booking_service (booking_id, service_id, resource_id, time_slot, price, cancellation_policy_id, status)
           VALUES ($1, $2, $3,
                   tstzrange($4::timestamptz, $4::timestamptz + make_interval(mins => $5)),
                   $6, $7, 'hold')`,
          [bookingId, s.serviceId, s.resourceId, s.startsAt, duration_min + buffer_min, price, cancellation_policy_id],
        );
        total += Number(price);
      }

      await client.query(`UPDATE booking SET total_price = $2 WHERE id = $1`, [bookingId, total]);
      await audit(client, bookingId, 'web', 'create_hold', { rooms: input.rooms, services: input.services });

      return { bookingId, status: 'hold', totalPrice: total, holdExpiresAt: booking.rows[0].hold_expires_at };
    });
  } catch (err: any) {
    if (err?.code === EXCLUSION_VIOLATION) throw new ConflictError('Termín je už obsadený');
    if (err?.code === UNIQUE_VIOLATION && String(err.constraint).includes('idempotency')) {
      throw new DuplicateRequestError('Rezervácia s týmto idempotency key už existuje');
    }
    throw err;
  }
}

/**
 * Krok 2: potvrdenie po úspešnej platbe. Hold → confirmed
 * + zápis do outboxu (asynchrónna fakturácia v ERP).
 */
export async function confirmBooking(bookingId: string) {
  return withTransaction(async (client) => {
    const upd = await client.query(
      `UPDATE booking SET status = 'confirmed', hold_expires_at = NULL
        WHERE id = $1 AND status = 'hold' AND hold_expires_at > now()
        RETURNING id, total_price`,
      [bookingId],
    );
    if (upd.rowCount === 0) throw new ConflictError('Hold neexistuje alebo expiroval');

    await client.query(
      `INSERT INTO sync_outbox (target, event_type, payload)
       SELECT t, 'booking.confirmed', jsonb_build_object('bookingId', $1::text)
         FROM unnest(ARRAY['erp','email']) AS t`,
      [bookingId],
    );
    await audit(client, bookingId, 'web', 'confirm', {});
    return { bookingId, status: 'confirmed' };
  });
}

/**
 * Storno – uvoľní termín (trigger propaguje status do položiek) a vypočíta
 * vrátenú sumu podľa storno politiky každej položky (čas do začiatku vs. pásma).
 * Refund sa počíta len pre potvrdené rezervácie; hold sa ruší bez poplatku.
 */
export async function cancelBooking(bookingId: string, actor: string) {
  return withTransaction(async (client) => {
    // Stav pred zmenou – hold ruší bez storna, confirmed počíta refund
    const cur = await client.query(
      `SELECT status FROM booking WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );
    if (cur.rowCount === 0 || !['hold', 'confirmed'].includes(cur.rows[0].status)) {
      throw new ConflictError('Rezervácia neexistuje alebo je už zrušená');
    }
    const wasConfirmed = cur.rows[0].status === 'confirmed';

    // Položky + ich storno pásma (pred propagáciou statusu do položiek)
    const items = await client.query(
      `SELECT lower(stay)::timestamptz AS starts_at, price, cancellation_policy_id
         FROM booking_room WHERE booking_id = $1
       UNION ALL
       SELECT lower(time_slot) AS starts_at, price, cancellation_policy_id
         FROM booking_service WHERE booking_id = $1`,
      [bookingId],
    );

    let refundTotal = 0;
    let feeTotal = 0;
    const lines: RefundLine[] = [];
    const now = new Date();
    for (const it of items.rows) {
      const price = Number(it.price);
      if (!wasConfirmed) {
        // hold: nič sa neplatilo → nič sa nevracia, žiadny poplatok
        lines.push({ price, refund: 0, fee: 0, refundPct: 0 });
        continue;
      }
      let tiers: CancellationTier[] = [];
      if (it.cancellation_policy_id) {
        const tr = await client.query(
          `SELECT hours_before AS "hoursBefore", refund_pct AS "refundPct"
             FROM cancellation_tier WHERE policy_id = $1`,
          [it.cancellation_policy_id],
        );
        tiers = tr.rows;
      } else {
        // NULL politika = plné vrátenie kedykoľvek
        tiers = [{ hoursBefore: 0, refundPct: 100 }];
      }
      const line = refundForItem(price, new Date(it.starts_at), now, tiers);
      lines.push(line);
      refundTotal += line.refund;
      feeTotal += line.fee;
    }
    refundTotal = Math.round(refundTotal * 100) / 100;
    feeTotal = Math.round(feeTotal * 100) / 100;

    await client.query(
      `UPDATE booking SET status = 'cancelled' WHERE id = $1`,
      [bookingId],
    );

    await client.query(
      `INSERT INTO sync_outbox (target, event_type, payload)
       SELECT t, 'booking.cancelled',
              jsonb_build_object('bookingId', $1::text, 'refund', $2::numeric, 'fee', $3::numeric)
         FROM unnest(ARRAY['erp','email']) AS t`,
      [bookingId, refundTotal, feeTotal],
    );
    await audit(client, bookingId, actor, 'cancel', { wasConfirmed, refundTotal, feeTotal, lines });
    return { bookingId, status: 'cancelled', refundTotal, feeTotal, lines };
  });
}
