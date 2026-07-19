/**
 * Session logika admin účtov.
 *
 * Token vidí len klient (httpOnly cookie). V DB je uložený výhradne jeho
 * SHA-256 hash – keby niekto získal dump databázy, nezíska použiteľné session.
 *
 * Funkcie berú `Queryable`, takže sa dajú testovať proti PGlite.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Queryable } from '../../db';
import { verifyPassword } from './password';

export const SESSION_TTL_HOURS = 12;
export const SESSION_COOKIE = 'admin_session';

/** Rate limit: max. neúspešných pokusov na e-mail za okno. */
export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 15;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'staff';
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Konštantno-časové porovnanie hashov (rovnaká dĺžka, hex). */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class LoginError extends Error {
  constructor(message: string, public code: 'invalid' | 'locked' | 'inactive') {
    super(message);
  }
}

/** Počet neúspešných pokusov pre e-mail v poslednom okne. */
export async function recentFailedAttempts(db: Queryable, email: string): Promise<number> {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM admin_login_attempt
      WHERE lower(email) = lower($1) AND success = false
        AND created_at > now() - ($2 || ' minutes')::interval`,
    [email, String(ATTEMPT_WINDOW_MINUTES)],
  );
  return r.rows[0]?.n ?? 0;
}

async function recordAttempt(
  db: Queryable, email: string, ip: string | null, success: boolean,
): Promise<void> {
  await db.query(
    'INSERT INTO admin_login_attempt (email, ip, success) VALUES ($1, $2, $3)',
    [email, ip, success],
  );
}

/**
 * Prihlásenie. Pri úspechu vytvorí session a vráti token (jediný moment,
 * keď token existuje v čitateľnej podobe).
 *
 * Zámerne nerozlišuje „neznámy e-mail" od „zlé heslo" – rovnaká hláška aj
 * rovnaký čas odpovede, aby sa nedali zisťovať existujúce účty.
 */
export async function login(
  db: Queryable,
  { email, password, ip, userAgent }: {
    email: string; password: string; ip?: string | null; userAgent?: string | null;
  },
): Promise<{ token: string; expiresAt: Date; user: AdminUser }> {
  const failed = await recentFailedAttempts(db, email);
  if (failed >= MAX_FAILED_ATTEMPTS) {
    throw new LoginError(
      `Príliš veľa neúspešných pokusov. Skúste o ${ATTEMPT_WINDOW_MINUTES} minút.`, 'locked',
    );
  }

  const r = await db.query(
    `SELECT id, email, name, role, active, password_hash
       FROM admin_user WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = r.rows[0];

  // Aj pri neznámom účte necháme prebehnúť overenie proti fiktívnemu hashu,
  // nech trvanie odpovede neprezradí, či e-mail existuje.
  const storedHash = row?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
  const passwordOk = await verifyPassword(password, storedHash);

  if (!row || !passwordOk) {
    await recordAttempt(db, email, ip ?? null, false);
    throw new LoginError('Nesprávny e-mail alebo heslo', 'invalid');
  }
  if (!row.active) {
    await recordAttempt(db, email, ip ?? null, false);
    throw new LoginError('Účet je deaktivovaný', 'inactive');
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);

  await db.query(
    `INSERT INTO admin_session (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [row.id, hashToken(token), expiresAt.toISOString(), userAgent ?? null],
  );
  await db.query('UPDATE admin_user SET last_login_at = now() WHERE id = $1', [row.id]);
  await recordAttempt(db, email, ip ?? null, true);

  return {
    token,
    expiresAt,
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
  };
}

/** Overí session token. Vráti používateľa alebo null (neplatné/expirované). */
export async function resolveSession(db: Queryable, token: string): Promise<AdminUser | null> {
  if (!token) return null;

  const r = await db.query(
    `SELECT s.id, u.id AS user_id, u.email, u.name, u.role, u.active
       FROM admin_session s
       JOIN admin_user u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row || !row.active) return null;

  await db.query('UPDATE admin_session SET last_seen_at = now() WHERE id = $1', [row.id]);
  return { id: row.user_id, email: row.email, name: row.name, role: row.role };
}

/** Odhlásenie – zmaže konkrétnu session. */
export async function logout(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM admin_session WHERE token_hash = $1', [hashToken(token)]);
}

/** Upratanie expirovaných sessions a starých záznamov o pokusoch. */
export async function purgeExpired(db: Queryable): Promise<void> {
  await db.query('DELETE FROM admin_session WHERE expires_at < now()');
  await db.query(`DELETE FROM admin_login_attempt WHERE created_at < now() - interval '30 days'`);
}
