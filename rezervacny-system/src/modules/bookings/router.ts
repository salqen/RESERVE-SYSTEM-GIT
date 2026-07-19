import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { createHold, confirmBooking, cancelBooking, ConflictError, DuplicateRequestError } from './service';

export const bookingsRouter = Router();

const holdSchema = z.object({
  idempotencyKey: z.string().min(8),
  customer: z.object({
    erpCustomerId: z.string().optional(),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  rooms: z.array(z.object({
    roomId: z.string().uuid(),
    checkIn: z.string().date(),
    checkOut: z.string().date(),
  })).default([]),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    resourceId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
  })).default([]),
  note: z.string().optional(),
});

/** POST /bookings/hold – krok 1: zamknutie termínu na HOLD_TTL_MINUTES */
bookingsRouter.post('/hold', async (req, res, next) => {
  try {
    const input = holdSchema.parse(req.body);
    if (input.rooms.length === 0 && input.services.length === 0) {
      return res.status(400).json({ error: 'Rezervácia musí mať aspoň jednu položku' });
    }
    res.status(201).json(await createHold(input));
  } catch (err) {
    handleError(err, res, next);
  }
});

/** POST /bookings/:id/confirm – krok 2: po úspešnej platbe */
bookingsRouter.post('/:id/confirm', async (req, res, next) => {
  try {
    res.json(await confirmBooking(req.params.id));
  } catch (err) {
    handleError(err, res, next);
  }
});

/** POST /bookings/:id/cancel */
bookingsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    res.json(await cancelBooking(req.params.id, req.body?.actor ?? 'web'));
  } catch (err) {
    handleError(err, res, next);
  }
});

/** GET /bookings/:id – detail vrátane položiek */
bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const b = await pool.query(
      `SELECT b.id, b.status, b.total_price, b.hold_expires_at, b.created_at,
              c.name AS customer_name, c.email AS customer_email
         FROM booking b JOIN customer c ON c.id = b.customer_id
        WHERE b.id = $1`,
      [req.params.id],
    );
    if (b.rowCount === 0) return res.status(404).json({ error: 'Rezervácia neexistuje' });

    const rooms = await pool.query(
      `SELECT br.room_id, r.name, lower(br.stay) AS check_in, upper(br.stay) AS check_out, br.price
         FROM booking_room br JOIN room r ON r.id = br.room_id WHERE br.booking_id = $1`,
      [req.params.id],
    );
    const services = await pool.query(
      `SELECT bs.service_id, s.name, bs.resource_id, lower(bs.time_slot) AS starts_at, bs.price
         FROM booking_service bs JOIN service s ON s.id = bs.service_id WHERE bs.booking_id = $1`,
      [req.params.id],
    );
    res.json({ ...b.rows[0], rooms: rooms.rows, services: services.rows });
  } catch (err) {
    next(err);
  }
});

function handleError(err: unknown, res: any, next: (e: unknown) => void) {
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
  if (err instanceof DuplicateRequestError) return res.status(409).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Neplatný vstup', detail: err.issues });
  next(err);
}
