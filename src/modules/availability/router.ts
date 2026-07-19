import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { computeFreeSlots, TimeRange } from './slots';

export const availabilityRouter = Router();

/**
 * GET /availability/rooms?from=2026-08-01&to=2026-08-05
 * Voľné izby v danom rozsahu nocí [from, to).
 * Za obsadené sa berú aktívne rezervácie (hold + confirmed) – expirované
 * holdy priebežne ruší cleanup job.
 */
availabilityRouter.get('/rooms', async (req, res, next) => {
  try {
    const q = z.object({ from: z.string().date(), to: z.string().date() }).parse(req.query);
    if (q.from >= q.to) return res.status(400).json({ error: 'from musí byť pred to' });

    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.room_type, r.capacity, r.min_nights,
              COALESCE(pr.price_night, r.price_night) AS price_night
         FROM room r
         LEFT JOIN room_price_rule pr
           ON pr.room_id = r.id AND pr.season @> $1::date
        WHERE r.active
          AND NOT EXISTS (
            SELECT 1 FROM booking_room br
             WHERE br.room_id = r.id
               AND br.status IN ('hold','confirmed')
               AND br.stay && daterange($1::date, $2::date)
          )
        ORDER BY r.name`,
      [q.from, q.to],
    );
    res.json({ from: q.from, to: q.to, rooms: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /availability/services/:serviceId?date=2026-08-01
 * Voľné začiatky slotov pre službu v daný deň, cez všetky zdroje,
 * ktoré ju vedia poskytnúť. Slot = duration_min + buffer_min.
 */
availabilityRouter.get('/services/:serviceId', async (req, res, next) => {
  try {
    const q = z.object({ date: z.string().date() }).parse(req.query);
    const serviceId = req.params.serviceId;

    const svc = await pool.query(
      `SELECT id, name, duration_min, buffer_min, price FROM service WHERE id = $1 AND active`,
      [serviceId],
    );
    if (svc.rowCount === 0) return res.status(404).json({ error: 'Služba neexistuje' });
    const service = svc.rows[0];
    const slotMin = service.duration_min + service.buffer_min;

    const weekday = new Date(`${q.date}T00:00:00Z`).getUTCDay();

    // Zdroje schopné poskytnúť službu + ich pracovné okno v daný deň
    const resources = await pool.query(
      `SELECT r.id, r.name, rh.open_time, rh.close_time
         FROM service_resource sr
         JOIN resource r ON r.id = sr.resource_id AND r.active
         JOIN resource_hours rh ON rh.resource_id = r.id AND rh.weekday = $2
        WHERE sr.service_id = $1`,
      [serviceId, weekday],
    );

    const result = [];
    for (const r of resources.rows) {
      // Obsadenosť zdroja: aktívne rezervácie + timeoff v daný deň
      const busyRows = await pool.query(
        `SELECT lower(time_slot) AS s, upper(time_slot) AS e
           FROM booking_service
          WHERE resource_id = $1 AND status IN ('hold','confirmed')
            AND time_slot && tstzrange($2::date, ($2::date + 1))
         UNION ALL
         SELECT lower(period), upper(period)
           FROM resource_timeoff
          WHERE resource_id = $1
            AND period && tstzrange($2::date, ($2::date + 1))`,
        [r.id, q.date],
      );
      const busy: TimeRange[] = busyRows.rows.map((b) => ({ start: b.s, end: b.e }));

      const window: TimeRange = {
        start: new Date(`${q.date}T${r.open_time}Z`),
        end: new Date(`${q.date}T${r.close_time}Z`),
      };
      const slots = computeFreeSlots(window, busy, slotMin);
      result.push({ resourceId: r.id, resourceName: r.name, freeSlots: slots });
    }

    res.json({ service: service.name, date: q.date, slotMinutes: slotMin, resources: result });
  } catch (err) {
    next(err);
  }
});
