/**
 * Autentifikácia admin API – session tokeny nad účtami v `admin_user`.
 *
 * Klient (Next.js admin) drží token v httpOnly cookie a posiela ho backendu
 * v hlavičke `Authorization: Bearer <session-token>`. Token je náhodných
 * 32 bajtov, v DB uložený len ako SHA-256 hash.
 */
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../db';
import { resolveSession, type AdminUser } from './sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
    }
  }
}

/** Vytiahne token z hlavičky `Authorization: Bearer <token>`. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Chráni admin endpointy. Bez platnej session vracia 401. */
export async function requireAdmin(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const token = bearerToken(req.header('authorization'));
  if (!token) {
    res.status(401).json({ error: 'Neautorizovaný prístup' });
    return;
  }

  try {
    const user = await resolveSession(pool, token);
    if (!user) {
      res.status(401).json({ error: 'Neplatná alebo vypršaná session' });
      return;
    }
    req.adminUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Obmedzí endpoint na rolu owner (správa používateľov a pod.). */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.adminUser?.role !== 'owner') {
    res.status(403).json({ error: 'Vyžaduje sa rola owner' });
    return;
  }
  next();
}
