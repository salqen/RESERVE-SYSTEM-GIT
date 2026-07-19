/**
 * Správa katalógu – izby a služby, ktoré vidí zákazník na webe.
 *
 * Položky sa nemažú, len deaktivujú (`active = false`): existujúce rezervácie
 * sa na ne odkazujú a mazanie by rozbilo históriu aj faktúry v ERP.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction, EXCLUSION_VIOLATION } from '../../db';

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
        `SELECT r.id, r.name, r.resource_type, r.active,
                COALESCE(json_agg(
                  json_build_object('weekday', h.weekday,
                                    'open', to_char(h.open_time, 'HH24:MI'),
                                    'close', to_char(h.close_time, 'HH24:MI'))
                  ORDER BY h.weekday
                ) FILTER (WHERE h.id IS NOT NULL), '[]') AS hours
           FROM resource r
           LEFT JOIN resource_hours h ON h.resource_id = r.id
          GROUP BY r.id ORDER BY r.active DESC, r.name`),
      pool.query('SELECT id, name FROM cancellation_policy ORDER BY name'),
    ]);

    const prices = await pool.query(
      `SELECT id, room_id, lower(season) AS season_from, upper(season) AS season_to, price_night
         FROM room_price_rule ORDER BY room_id, lower(season)`);

    res.json({
      rooms: rooms.rows,
      services: services.rows,
      resources: resources.rows,
      policies: policies.rows,
      prices: prices.rows,
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

// ------------------------------------------------------------ sezónne ceny

const priceRuleSchema = z.object({
  season_from: z.string().date(),
  season_to: z.string().date(),
  price_night: z.coerce.number().min(0).max(100000),
});

/**
 * POST /admin/catalog/rooms/:id/prices – sezónna cena.
 * Prekryv sezón blokuje exclusion constraint priamo v DB; chybu 23P01
 * prekladáme na zrozumiteľnú hlášku.
 */
adminCatalogRouter.post('/rooms/:id/prices', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID izby' });
    }
    const parsed = priceRuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skontrolujte dátumy a cenu' });
    if (parsed.data.season_from >= parsed.data.season_to) {
      return res.status(400).json({ error: 'Začiatok sezóny musí byť pred koncom' });
    }

    const r = await pool.query(
      `INSERT INTO room_price_rule (room_id, season, price_night)
       VALUES ($1, daterange($2::date, $3::date), $4) RETURNING id`,
      [req.params.id, parsed.data.season_from, parsed.data.season_to, parsed.data.price_night],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    if ((err as { code?: string }).code === EXCLUSION_VIOLATION) {
      return res.status(409).json({ error: 'Sezóna sa prekrýva s inou sezónou tejto izby' });
    }
    next(err);
  }
});

adminCatalogRouter.delete('/prices/:ruleId', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.ruleId).success) {
      return res.status(400).json({ error: 'Neplatné ID pravidla' });
    }
    const r = await pool.query('DELETE FROM room_price_rule WHERE id = $1', [req.params.ruleId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Pravidlo neexistuje' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- zdroje

const resourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  resource_type: z.enum(['staff', 'room', 'equipment']),
});

adminCatalogRouter.post('/resources', async (req, res, next) => {
  try {
    const parsed = resourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Zadajte názov a typ zdroja' });

    const propertyId = await ensurePropertyId();
    const r = await pool.query(
      `INSERT INTO resource (property_id, name, resource_type) VALUES ($1, $2, $3) RETURNING id`,
      [propertyId, parsed.data.name, parsed.data.resource_type],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    next(err);
  }
});

const resourcePatchSchema = resourceSchema.partial().extend({ active: z.boolean().optional() });
const RESOURCE_COLUMNS = ['name', 'resource_type', 'active'] as const;

adminCatalogRouter.patch('/resources/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID zdroja' });
    }
    const parsed = resourcePatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skontrolujte vyplnené polia' });

    const { sets, params } = buildUpdate(parsed.data, RESOURCE_COLUMNS);
    if (sets.length === 0) return res.status(400).json({ error: 'Žiadna zmena' });

    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE resource SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Zdroj neexistuje' });
    res.json({ id: r.rows[0].id });
  } catch (err) {
    next(err);
  }
});

const hoursSchema = z.object({
  hours: z.array(z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  })).max(7),
});

/**
 * PUT /admin/catalog/resources/:id/hours – celý týždenný rozvrh naraz.
 * Nahrádza sa kompletne; dni, ktoré neprídu, znamenajú voľno.
 */
adminCatalogRouter.put('/resources/:id/hours', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID zdroja' });
    }
    const parsed = hoursSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Neplatný rozvrh' });

    for (const h of parsed.data.hours) {
      if (h.open >= h.close) {
        return res.status(400).json({ error: 'Začiatok musí byť pred koncom pracovného času' });
      }
    }

    await withTransaction(async (client) => {
      await client.query('DELETE FROM resource_hours WHERE resource_id = $1', [req.params.id]);
      for (const h of parsed.data.hours) {
        await client.query(
          `INSERT INTO resource_hours (resource_id, weekday, open_time, close_time)
           VALUES ($1, $2, $3::time, $4::time)`,
          [req.params.id, h.weekday, h.open, h.close],
        );
      }
    });

    res.json({ id: req.params.id, days: parsed.data.hours.length });
  } catch (err) {
    next(err);
  }
});
