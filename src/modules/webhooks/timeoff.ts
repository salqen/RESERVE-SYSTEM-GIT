/**
 * Fáza 3 – príjem zmien dostupnosti personálu zo service managera.
 *
 * Zapíše timeoff (dovolenka/PN) a zistí KONFLIKTY s existujúcimi aktívnymi
 * rezerváciami toho istého zdroja. Konflikt sa nerieši automaticky – vráti sa
 * volajúcemu, zapíše do audit logu a do outboxu ide notifikácia
 * ('timeoff.conflict') na manuálne riešenie. Automatický presun = ďalšia verzia.
 */
import { pool, Queryable } from '../../db';

export interface TimeoffInput {
  resourceId: string;
  start: string;  // ISO timestamptz
  end: string;    // ISO timestamptz
  reason?: string;
}

export interface TimeoffConflict {
  bookingId: string;
  serviceName: string;
  customerName: string;
  customerEmail: string;
  slotStart: string;
  slotEnd: string;
  status: string;
}

export async function registerTimeoff(input: TimeoffInput, db: Queryable = pool) {
  const ins = await db.query(
    `INSERT INTO resource_timeoff (resource_id, period, reason)
     VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz), $4)
     RETURNING id`,
    [input.resourceId, input.start, input.end, input.reason ?? null],
  );
  const timeoffId = ins.rows[0].id;

  const conflicts = await db.query(
    `SELECT bs.booking_id AS "bookingId", s.name AS "serviceName",
            c.name AS "customerName", c.email AS "customerEmail",
            lower(bs.time_slot) AS "slotStart", upper(bs.time_slot) AS "slotEnd",
            bs.status
       FROM booking_service bs
       JOIN service s ON s.id = bs.service_id
       JOIN booking b ON b.id = bs.booking_id
       JOIN customer c ON c.id = b.customer_id
      WHERE bs.resource_id = $1
        AND bs.status IN ('hold','confirmed')
        AND bs.time_slot && tstzrange($2::timestamptz, $3::timestamptz)
      ORDER BY lower(bs.time_slot)`,
    [input.resourceId, input.start, input.end],
  );

  if (conflicts.rows.length > 0) {
    await db.query(
      `INSERT INTO sync_outbox (target, event_type, payload)
       VALUES ('service_manager', 'timeoff.conflict',
               jsonb_build_object('timeoffId', $1::text, 'resourceId', $2::text,
                                  'start', $3::text, 'end', $4::text,
                                  'bookingIds', $5::jsonb))`,
      [timeoffId, input.resourceId, input.start, input.end,
       JSON.stringify(conflicts.rows.map((c: any) => c.bookingId))],
    );
    for (const c of conflicts.rows) {
      await db.query(
        `INSERT INTO audit_log (booking_id, actor, action, detail)
         VALUES ($1, 'service_manager', 'timeoff_conflict', $2)`,
        [c.bookingId, JSON.stringify({ timeoffId, resourceId: input.resourceId, start: input.start, end: input.end })],
      );
    }
  }

  return { timeoffId, conflicts: conflicts.rows as TimeoffConflict[] };
}
