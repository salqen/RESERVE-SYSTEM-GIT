/**
 * Prihlasovacie endpointy admina. Mountujú sa PRED requireAdmin – login
 * pochopiteľne nemôže vyžadovať platnú session.
 *
 *   POST /admin/auth/login   { email, password } → { token, expiresAt, user }
 *   POST /admin/auth/logout  (Bearer token)      → 204
 *   GET  /admin/auth/me      (Bearer token)      → { user }
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { bearerToken } from './auth';
import { login, logout, resolveSession, LoginError } from './sessions';

export const adminAuthRouter = Router();

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

adminAuthRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      // Nevraciame detail validácie – nech sa nedá mapovať, čo server očakáva.
      return res.status(400).json({ error: 'Zadajte e-mail a heslo' });
    }

    const result = await login(pool, {
      email: parsed.data.email,
      password: parsed.data.password,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });

    res.json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user: result.user,
    });
  } catch (err) {
    if (err instanceof LoginError) {
      return res.status(err.code === 'locked' ? 429 : 401).json({ error: err.message });
    }
    next(err);
  }
});

adminAuthRouter.post('/logout', async (req, res, next) => {
  try {
    const token = bearerToken(req.header('authorization'));
    if (token) await logout(pool, token);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminAuthRouter.get('/me', async (req, res, next) => {
  try {
    const token = bearerToken(req.header('authorization'));
    const user = token ? await resolveSession(pool, token) : null;
    if (!user) return res.status(401).json({ error: 'Neautorizovaný prístup' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
