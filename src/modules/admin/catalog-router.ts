/**
 * Správa katalógu – izby a služby, ktoré vidí zákazník na webe.
 *
 * Položky sa nemažú, len deaktivujú (`active = false`): existujúce rezervácie
 * sa na ne odkazujú a mazanie by rozbilo históriu aj faktúry v ERP.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';

export const adminCatalogRouter = Router();

/**
 * Poskladá SET časť UPDATE-u len z povolených stĺpcov.
 * Názvy stĺpcov nikdy neberieme priamo z tela požiadavky – aj keď ich zod
 * filtruje, whitelist je to, čo tu bráni injektáži cez názov poľa.
 */
function buildUpdate(
  data: Record<string, unknown>, allowed: readonly string[],
): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const column of allowed) {
    const value = data[column];
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  return { sets, params };
}

const ROOM_COLUMNS = [
  'name', 'room_type', 'capacity', 'price_night', 'min_nights',
  'cancellation_policy_id', 'active',
] as const;

const SERVICE_COLUMNS = [
  'name', 'duration_min', 'buffer_min', 'price', 'cancellation_policy_id', 'active',
] as const;

/** Prevádzka je zatiaľ jedna; ak neexistuje, založí sa pri prvom zápise. */
async function ensurePropertyId(): Promise<string> {
  const found = await pool.query('SELECT id FROM property ORDER BY created_at LIMIT 1');
  if (found.rows[0]) return found.rows[0].id;
  const created = await pool.query(
    `INSERT INTO property (name) VALUES ('Prevádzka') RETURNING id`,
  );
  return created.rows[0].id;
}

/** GET /admin/catalog – všetko vrátane deaktivovaných položiek. */
adminCatalogRouter.get('/', async (_req, res, next) => {
  try {
    const [rooms, services, resources, policies] = await Promise.all([
      pool.query(
        `SELECT id, name, room_type, capacity, price_night, min_nights,
                cancellation_policy_id, active
           FROM room ORDER BY active DESC, name`),
      pool.query(
        `SELECT s.id, s.name, s.duration_min, s.buffer_min, s.price,
                s.cancellation_policy_id, s.active,
                COALESCE(json_agg(sr.resource_id) FILTER (WHERE sr.resource_id IS NOT NULL), '[]')
                  AS resource_ids
           FROM service s
           LEFT JOIN service_resource sr ON sr.service_id = s.id
          GROUP BY s.id ORDER BY s.active DESC, s.name`),
      pool.query(
        `SELECT id, name, resource_type, active FROM resource ORDER BY active DESC, name`),
      pool.query('SELECT id, name FROM cancellation_policy ORDER BY name'),
    ]);

    res.json({
      rooms: rooms.rows,
      services: services.rows,
      resources: resources.rows,
      policies: policies.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------- izby

const roomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  room_type: z.string().trim().min(1).max(60),
  capacity: z.coerce.number().int().min(1).max(50),
  price_night: z.coerce.number().min(0).max(100000),
  min_nights: z.coerce.number().int().min(1).max(365).default(1),
  cancellation_policy_id: z.string().uuid().nullable().optional(),
});

adminCatalogRouter.post('/rooms', async (req, res, next) => {
  try {
    const parsed = roomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skontrolujte vyplnené polia' });

    const propertyId = await ensurePropertyId();
    const r = await pool.query(
      `INSERT INTO room (property_id, name, room_type, capacity, price_night,
                         min_nights, cancellation_policy_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [propertyId, parsed.data.name, parsed.data.room_type, parsed.data.capacity,
        parsed.data.price_night, parsed.data.min_nights,
        parsed.data.cancellation_policy_id ?? null],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    next(err);
  }
});

const roomPatchSchema = roomSchema.partial().extend({ active: z.boolean().optional() });

adminCatalogRouter.patch('/rooms/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID izby' });
    }
    const parsed = roomPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skontrolujte vyplnené polia' });

    const { sets, params } = buildUpdate(parsed.data, ROOM_COLUMNS);
    if (sets.length === 0) return res.status(400).json({ error: 'Žiadna zmena' });

    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE room SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Izba neexistuje' });
    res.json({ id: r.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- služby

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  duration_min: z.coerce.number().int().min(5).max(1440),
  buffer_min: z.coerce.number().int().min(0).max(1440).default(0),
  price: z.coerce.number().min(0).max(100000),
  cancellation_policy_id: z.string().uuid().nullable().optional(),
  resource_ids: z.array(z.string().uuid()).default([]),
});

adminCatalogRouter.post('/services', async (req, res, next) => {
  try {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skontrolujte vyplnené polia' });

    const propertyId = await ensurePropertyId();
    const r = await pool.query(
      `INSERT INTO service (property_id, name, duration_min, buffer_min, price,
                            cancellation_policy_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [propertyId, parsed.data.name, parsed.data.duration_min, parsed.data.buffer_min,
        parsed.data.price, parsed.data.cancellation_policy_id ?? null],
    );
    const serviceId = r.rows[0].id;

    for (const resourceId of parsed.data.resource_ids) {
      await pool.query(
        `INSERT INTO service_resource (service_id, resource_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`, [serviceId, resourceId]);
    }
    res.status(201).json({ id: serviceId });
  } catch (err) {
    next(err);
  }
});

const servicePatchSchema = serviceSchema.partial().extend({ active: z.boolean().optional() });

adminCatalogRouter.patch('/services/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID služby' });
    }
    const parsed = servicePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skontrolujte vyplnené polia' });

    const { resource_ids } = parsed.data;
    const { sets, params } = buildUpdate(parsed.data, SERVICE_COLUMNS);

    if (sets.length > 0) {
      params.push(req.params.id);
      const r = await pool.query(
        `UPDATE service SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
      if (r.rowCount === 0) return res.status(404).json({ error: 'Služba neexistuje' });
    }

    // Priradenie zdrojov sa nahrádza celé – jednoduchšie a predvídateľnejšie
    // než dopočítavať rozdiel.
    if (resource_ids !== undefined) {
      await pool.query('DELETE FROM service_resource WHERE service_id = $1', [req.params.id]);
      for (const resourceId of resource_ids) {
        await pool.query(
          `INSERT INTO service_resource (service_id, resource_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`, [req.params.id, resourceId]);
      }
    }

    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});
