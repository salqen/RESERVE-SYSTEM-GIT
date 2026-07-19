/**
 * Fáza 4 – katalóg pre zákaznícky web: zoznam aktívnych izieb a služieb.
 * (Dostupnosť konkrétnych termínov rieši /availability.)
 */
import { Router } from 'express';
import { pool } from '../../db';

export const catalogRouter = Router();

catalogRouter.get('/', async (_req, res, next) => {
  try {
    const rooms = await pool.query(
      `SELECT id, name, room_type, capacity, price_night, min_nights
         FROM room WHERE active ORDER BY name`,
    );
    const services = await pool.query(
      `SELECT id, name, duration_min, buffer_min, price
         FROM service WHERE active ORDER BY name`,
    );
    res.json({ rooms: rooms.rows, services: services.rows });
  } catch (err) {
    next(err);
  }
});
