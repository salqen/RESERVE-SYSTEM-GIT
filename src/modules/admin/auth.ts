/**
 * Autentifikácia admin API.
 *
 * Zdieľaný token v hlavičke `Authorization: Bearer <ADMIN_TOKEN>`.
 * Zámerne jednoduché – admin je zatiaľ interné rozhranie bez používateľských
 * účtov. Keď pribudne admin UI s prihlásením, toto sa nahradí sessions/JWT.
 *
 * Princíp fail-closed: ak ADMIN_TOKEN nie je nastavený, admin API je zavreté
 * (503), nie otvorené. Chýbajúca konfigurácia nesmie znamenať verejný prístup.
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';

/** Porovnanie odolné voči timing útoku (aj pri rôznych dĺžkach). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Vytiahne token z hlavičky `Authorization: Bearer <token>`. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) {
    console.error('ADMIN_TOKEN nie je nastavený – admin API je zavreté.');
    res.status(503).json({ error: 'Admin API nie je nakonfigurované' });
    return;
  }

  const token = bearerToken(req.header('authorization'));
  if (!token || !safeEqual(token, config.adminToken)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'Neautorizovaný prístup' });
    return;
  }

  next();
}
