/**
 * Admin API nad rezerváciami – zoznam s filtrom, detail, ručné storno.
 * Router je mountovaný až za requireAdmin, takže `req.adminUser` je vždy k dispozícii.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { cancelBooking, ConflictError } from '../bookings/service';

export const adminBookingsRouter = Router();

const PAGE_SIZE = 25;

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['hold', 'confirmed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

/**
 * Zostaví WHERE časť zoznamu rezervácií. Vyčlenené kvôli testovateľnosti –
 * skladanie SQL s číslovanými parametrami je presne to miesto, kde sa ľahko
 * spraví chyba (posun indexov, cast neplatného UUID).
 */
export function buildBookingFilter(
  { q, status }: { q?: string; status?: string },
): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    where.push(`b.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const like = `$${params.length}`;
    // Podľa ID hľadáme len ak vstup vyzerá ako časť UUID – inak by cast padol.
    const idMatch = /^[0-9a-f-]{4,}$/i.test(q) ? ` OR b.id::text LIKE ${like}` : '';
    where.push(`(c.name ILIKE ${like} OR c.email ILIKE ${like}${idMatch})`);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * GET /admin/bookings?q=&status=&page=
 * Hľadá podľa mena a e-mailu zákazníka; `q` sa dá použiť aj na ID rezervácie.
 */
adminBookingsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Neplatný filter' });
    const { q, status, page } = parsed.data;

    const { whereSql, params } = buildBookingFilter({ q, status });
    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);

    const rows = await pool.query(
      `SELECT b.id, b.status, b.total_price, b.payment_status, b.created_at,
              b.hold_expires_at, c.name AS customer_name, c.email AS customer_email,
              (SELECT count(*) FROM booking_room br WHERE br.booking_id = b.id)::int AS room_count,
              (SELECT count(*) FROM booking_service bs WHERE bs.booking_id = b.id)::int AS service_count,
              (SELECT min(lower(br.stay)) FROM booking_room br WHERE br.booking_id = b.id) AS first_night
         FROM booking b
         JOIN customer c ON c.id = b.customer_id
         ${whereSql}
        ORDER BY b.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const totalParams = params.slice(0, params.length - 2);
    const count = await pool.query(
      `SELECT count(*)::int AS n FROM booking b JOIN customer c ON c.id = b.customer_id ${whereSql}`,
      totalParams,
    );

    res.json({
      bookings: rows.rows,
      page,
      pageSize: PAGE_SIZE,
      total: count.rows[0].n,
      totalPages: Math.max(1, Math.ceil(count.rows[0].n / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /admin/bookings/:id – detail vrátane položiek a histórie zmien. */
adminBookingsRouter.get('/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID rezervácie' });
    }

    const b = await pool.query(
      `SELECT b.id, b.status, b.total_price, b.payment_status, b.erp_invoice_id,
              b.hold_expires_at, b.created_at, b.note,
              c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
         FROM booking b JOIN customer c ON c.id = b.customer_id
        WHERE b.id = $1`,
      [req.params.id],
    );
    if (b.rowCount === 0) return res.status(404).json({ error: 'Rezervácia neexistuje' });

    const [rooms, services, audit] = await Promise.all([
      pool.query(
        `SELECT br.room_id, r.name, br.status, lower(br.stay) AS check_in,
                upper(br.stay) AS check_out, br.price
           FROM booking_room br JOIN room r ON r.id = br.room_id
          WHERE br.booking_id = $1 ORDER BY lower(br.stay)`,
        [req.params.id],
      ),
      pool.query(
        `SELECT bs.service_id, s.name, bs.status, res.name AS resource_name,
                lower(bs.time_slot) AS starts_at, upper(bs.time_slot) AS ends_at, bs.price
           FROM booking_service bs
           JOIN service s ON s.id = bs.service_id
           LEFT JOIN resource res ON res.id = bs.resource_id
          WHERE bs.booking_id = $1 ORDER BY lower(bs.time_slot)`,
        [req.params.id],
      ),
      pool.query(
        `SELECT actor, action, detail, created_at FROM audit_log
          WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.params.id],
      ),
    ]);

    res.json({
      ...b.rows[0],
      rooms: rooms.rows,
      services: services.rows,
      audit: audit.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/bookings/:id/cancel – ručné storno správcom.
 * Do audit logu sa zapíše e-mail správcu, nech je dohľadateľné, kto rušil.
 */
adminBookingsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID rezervácie' });
    }
    const actor = `admin:${req.adminUser?.email ?? 'neznámy'}`;
    res.json(await cancelBooking(req.params.id, actor));
  } catch (err) {
    // Neexistujúca alebo už zrušená rezervácia – nie je to chyba servera.
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
    next(err);
  }
});
