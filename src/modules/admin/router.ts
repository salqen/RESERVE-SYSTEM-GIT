import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { adminBookingsRouter } from './bookings-router';
import { adminUsersRouter } from './users-router';
import { adminCatalogRouter } from './catalog-router';
import { adminOverviewRouter } from './overview-router';

export const adminRouter = Router();

adminRouter.use('/bookings', adminBookingsRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/catalog', adminCatalogRouter);
adminRouter.use('/overview', adminOverviewRouter);

/**
 * GET /admin/calendar?from=2026-08-01&to=2026-08-08[&propertyId=...]
 *
 * Prehľad obsadenosti pre admin kalendár:
 *  - rooms:     každá izba + jej aktívne rezervácie prekrývajúce sa s [from, to)
 *  - resources: každý zdroj + jeho obsadené sloty (rezervácie) a timeoff v rozsahu
 *
 * Berú sa aktívne položky (hold + confirmed); zrušené a expirované sa nezobrazujú.
 */
adminRouter.get('/calendar', async (req, res, next) => {
  try {
    const q = z.object({
      from: z.string().date(),
      to: z.string().date(),
      propertyId: z.string().uuid().optional(),
    }).parse(req.query);
    if (q.from >= q.to) return res.status(400).json({ error: 'from musí byť pred to' });

    const propFilter = q.propertyId ? 'AND r.property_id = $3' : '';
    const params: unknown[] = [q.from, q.to];
    if (q.propertyId) params.push(q.propertyId);

    // Izby + prekrývajúce sa aktívne rezervácie
    const rooms = await pool.query(
      `SELECT r.id AS room_id, r.name AS room_name, r.room_type,
              COALESCE(json_agg(
                json_build_object(
                  'bookingId', br.booking_id,
                  'checkIn',  lower(br.stay),
                  'checkOut', upper(br.stay),
                  'status',   br.status,
                  'customer', c.name
                ) ORDER BY lower(br.stay)
              ) FILTER (WHERE br.id IS NOT NULL), '[]') AS bookings
         FROM room r
         LEFT JOIN booking_room br
           ON br.room_id = r.id
          AND br.status IN ('hold','confirmed')
          AND br.stay && daterange($1::date, $2::date)
         LEFT JOIN booking b ON b.id = br.booking_id
         LEFT JOIN customer c ON c.id = b.customer_id
        WHERE r.active ${propFilter}
        GROUP BY r.id, r.name, r.room_type
        ORDER BY r.name`,
      params,
    );

    // Zdroje + obsadené sloty (rezervácie) a timeoff v rozsahu
    const resources = await pool.query(
      `SELECT res.id AS resource_id, res.name AS resource_name, res.resource_type,
              COALESCE(json_agg(
                json_build_object('kind','booking','start', lower(bs.time_slot),
                                  'end', upper(bs.time_slot), 'status', bs.status,
                                  'serviceId', bs.service_id)
                ORDER BY lower(bs.time_slot)
              ) FILTER (WHERE bs.id IS NOT NULL), '[]') AS busy,
              COALESCE((
                SELECT json_agg(json_build_object('kind','timeoff','start', lower(t.period),
                                                  'end', upper(t.period), 'reason', t.reason)
                       ORDER BY lower(t.period))
                  FROM resource_timeoff t
                 WHERE t.resource_id = res.id
                   AND t.period && tstzrange($1::date, $2::date)
              ), '[]') AS timeoff
         FROM resource res
         LEFT JOIN booking_service bs
           ON bs.resource_id = res.id
          AND bs.status IN ('hold','confirmed')
          AND bs.time_slot && tstzrange($1::date, $2::date)
        WHERE res.active ${q.propertyId ? 'AND res.property_id = $3' : ''}
        GROUP BY res.id, res.name, res.resource_type
        ORDER BY res.name`,
      params,
    );

    res.json({ from: q.from, to: q.to, rooms: rooms.rows, resources: resources.rows });
  } catch (err) {
    next(err);
  }
});
