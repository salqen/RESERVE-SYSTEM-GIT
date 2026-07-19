/**
 * Podklady pre úvodnú obrazovku adminu – čísla, ktoré chce správca vidieť
 * hneď po prihlásení, a zoznam dnešných príchodov a odchodov.
 *
 * Všetko je čítanie; jeden endpoint, aby stránka nerobila päť volaní.
 */
import { Router } from 'express';
import { pool } from '../../db';

export const adminOverviewRouter = Router();

adminOverviewRouter.get('/', async (_req, res, next) => {
  try {
    const [metrics, arrivals, departures, attention] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT count(*) FROM booking WHERE status = 'confirmed')::int AS confirmed_total,
          (SELECT count(*) FROM booking WHERE status = 'hold'
             AND hold_expires_at > now())::int AS active_holds,
          (SELECT count(*) FROM booking_room
             WHERE status = 'confirmed' AND lower(stay) = current_date)::int AS arrivals_today,
          (SELECT count(*) FROM booking_room
             WHERE status = 'confirmed' AND upper(stay) = current_date)::int AS departures_today,
          (SELECT count(*) FROM booking_room
             WHERE status = 'confirmed' AND stay @> current_date)::int AS occupied_tonight,
          (SELECT count(*) FROM room WHERE active)::int AS rooms_active,
          (SELECT COALESCE(sum(total_price), 0) FROM booking
             WHERE status = 'confirmed'
               AND created_at >= date_trunc('month', current_date))::numeric AS revenue_month,
          (SELECT count(*) FROM booking
             WHERE status = 'confirmed' AND payment_status = 'unpaid')::int AS unpaid_count,
          (SELECT count(*) FROM sync_outbox WHERE status = 'failed')::int AS outbox_failed,
          (SELECT count(*) FROM sync_outbox WHERE status = 'pending')::int AS outbox_pending
      `),
      pool.query(`
        SELECT b.id, c.name AS customer_name, r.name AS room_name,
               lower(br.stay) AS check_in, upper(br.stay) AS check_out
          FROM booking_room br
          JOIN booking b ON b.id = br.booking_id
          JOIN customer c ON c.id = b.customer_id
          JOIN room r ON r.id = br.room_id
         WHERE br.status = 'confirmed' AND lower(br.stay) = current_date
         ORDER BY r.name`),
      pool.query(`
        SELECT b.id, c.name AS customer_name, r.name AS room_name,
               lower(br.stay) AS check_in, upper(br.stay) AS check_out
          FROM booking_room br
          JOIN booking b ON b.id = br.booking_id
          JOIN customer c ON c.id = b.customer_id
          JOIN room r ON r.id = br.room_id
         WHERE br.status = 'confirmed' AND upper(br.stay) = current_date
         ORDER BY r.name`),
      // Veci, ktoré si pýtajú zásah – prázdny zoznam znamená, že je pokoj.
      pool.query(`
        SELECT 'service_no_resource' AS kind, s.name AS label
          FROM service s
         WHERE s.active AND NOT EXISTS (
           SELECT 1 FROM service_resource sr WHERE sr.service_id = s.id)
        UNION ALL
        SELECT 'resource_no_hours', r.name
          FROM resource r
         WHERE r.active AND NOT EXISTS (
           SELECT 1 FROM resource_hours h WHERE h.resource_id = r.id)
        UNION ALL
        SELECT 'no_active_rooms', 'Žiadna izba nie je zverejnená'
         WHERE NOT EXISTS (SELECT 1 FROM room WHERE active)
      `),
    ]);

    // Obsadenosť na najbližších 14 dní – podklad pre stĺpcový graf.
    const week = await pool.query(`
      WITH days AS (
        SELECT generate_series(current_date, current_date + 13, '1 day')::date AS day
      )
      SELECT d.day,
             (SELECT count(*) FROM booking_room br
               WHERE br.status IN ('confirmed','hold') AND br.stay @> d.day)::int AS occupied
        FROM days d ORDER BY d.day`);

    const recent = await pool.query(`
      SELECT b.id, b.status, b.total_price, b.created_at, c.name AS customer_name
        FROM booking b JOIN customer c ON c.id = b.customer_id
       ORDER BY b.created_at DESC LIMIT 6`);

    res.json({
      metrics: metrics.rows[0],
      arrivals: arrivals.rows,
      departures: departures.rows,
      attention: attention.rows,
      week: week.rows,
      recent: recent.rows,
    });
  } catch (err) {
    next(err);
  }
});
