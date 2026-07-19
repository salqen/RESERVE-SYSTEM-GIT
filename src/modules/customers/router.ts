/**
 * Zákaznícky účet – verejné endpointy pod /account.
 * Token vracia backend, web ho drží v httpOnly cookie.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import {
  register, login, logout, resolveSession, listBookings, AccountError,
} from './account';

export const accountRouter = Router();

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

async function currentCustomer(req: { header(name: string): string | undefined }) {
  const token = bearer(req.header('authorization'));
  return token ? resolveSession(pool, token) : null;
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().max(200),
  phone: z.string().trim().max(40).optional(),
});

accountRouter.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Vyplňte meno, e-mail a heslo' });

    const result = await register(pool, parsed.data);
    res.status(201).json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      customer: result.customer,
    });
  } catch (err) {
    if (err instanceof AccountError) {
      return res.status(err.code === 'exists' ? 409 : 400).json({ error: err.message });
    }
    next(err);
  }
});

accountRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = z.object({
      email: z.string().email().max(200),
      password: z.string().min(1).max(200),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Zadajte e-mail a heslo' });

    const result = await login(pool, parsed.data);
    res.json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      customer: result.customer,
    });
  } catch (err) {
    if (err instanceof AccountError) return res.status(401).json({ error: err.message });
    next(err);
  }
});

accountRouter.post('/logout', async (req, res, next) => {
  try {
    const token = bearer(req.header('authorization'));
    if (token) await logout(pool, token);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

accountRouter.get('/me', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req);
    if (!customer) return res.status(401).json({ error: 'Neprihlásený' });
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

accountRouter.get('/bookings', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req);
    if (!customer) return res.status(401).json({ error: 'Neprihlásený' });
    res.json({ bookings: await listBookings(pool, customer.id) });
  } catch (err) {
    next(err);
  }
});
