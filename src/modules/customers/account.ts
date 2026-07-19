/**
 * Zákaznícke účty – registrácia, prihlásenie, sessions.
 *
 * Rovnaký bezpečnostný model ako admin (scrypt heslá, v DB len hash
 * session tokenu), preto sa hashovanie zdieľa z `modules/admin/password`.
 *
 * Špecifikum oproti adminovi: účet sa **pridáva k existujúcemu zákazníkovi**.
 * Kto už rezervoval bez účtu, má riadok v `customer` bez hesla – registrácia
 * mu len doplní heslo a on hneď vidí svoje staršie rezervácie.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../../db';
import { hashPassword, verifyPassword, validatePassword } from '../admin/password';

export const SESSION_TTL_HOURS = 24 * 30; // zákazník nechce prihlasovať každý deň
export const MAX_FAILED_ATTEMPTS = 8;

export interface CustomerIdentity {
  id: string; name: string; email: string;
}

export class AccountError extends Error {
  constructor(message: string, public code: 'invalid' | 'exists' | 'weak' | 'no_password') {
    super(message);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

async function createSession(
  db: Queryable, customerId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await db.query(
    `INSERT INTO customer_session (customer_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [customerId, hashToken(token), expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

/**
 * Registrácia. Ak e-mail už má heslo, je to pokus o duplicitný účet.
 * Ak existuje bez hesla (rezervoval ako hosť), heslo sa doplní.
 */
export async function register(
  db: Queryable,
  { name, email, password, phone }: {
    name: string; email: string; password: string; phone?: string | null;
  },
): Promise<{ token: string; expiresAt: Date; customer: CustomerIdentity }> {
  const problem = validatePassword(password);
  if (problem) throw new AccountError(problem, 'weak');

  const existing = await db.query(
    `SELECT id, name, email, password_hash FROM customer WHERE lower(email) = lower($1)`,
    [email],
  );

  const hash = await hashPassword(password);
  let customer: CustomerIdentity;

  if (existing.rows[0]) {
    if (existing.rows[0].password_hash) {
      throw new AccountError('Účet s týmto e-mailom už existuje. Prihláste sa.', 'exists');
    }
    const updated = await db.query(
      `UPDATE customer SET password_hash = $2, name = $3,
              phone = COALESCE($4, phone)
        WHERE id = $1 RETURNING id, name, email`,
      [existing.rows[0].id, hash, name, phone ?? null],
    );
    customer = updated.rows[0];
  } else {
    const created = await db.query(
      `INSERT INTO customer (name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
      [name, email, phone ?? null, hash],
    );
    customer = created.rows[0];
  }

  const session = await createSession(db, customer.id);
  return { ...session, customer };
}

/** Prihlásenie. Nerozlišuje neznámy e-mail od zlého hesla. */
export async function login(
  db: Queryable, { email, password }: { email: string; password: string },
): Promise<{ token: string; expiresAt: Date; customer: CustomerIdentity }> {
  const r = await db.query(
    `SELECT id, name, email, password_hash FROM customer WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = r.rows[0];

  // Aj bez účtu necháme overenie prebehnúť, nech čas odpovede neprezradí,
  // ktoré e-maily sú v systéme.
  const stored = row?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
  const ok = await verifyPassword(password, stored);

  if (!row || !row.password_hash || !ok) {
    throw new AccountError('Nesprávny e-mail alebo heslo', 'invalid');
  }

  await db.query('UPDATE customer SET last_login_at = now() WHERE id = $1', [row.id]);
  const session = await createSession(db, row.id);
  return { ...session, customer: { id: row.id, name: row.name, email: row.email } };
}

export async function resolveSession(
  db: Queryable, token: string,
): Promise<CustomerIdentity | null> {
  if (!token) return null;
  const r = await db.query(
    `SELECT c.id, c.name, c.email, s.id AS session_id
       FROM customer_session s JOIN customer c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row) return null;

  await db.query('UPDATE customer_session SET last_seen_at = now() WHERE id = $1', [row.session_id]);
  return { id: row.id, name: row.name, email: row.email };
}

export async function logout(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM customer_session WHERE token_hash = $1', [hashToken(token)]);
}

export async function purgeExpiredCustomerSessions(db: Queryable): Promise<void> {
  await db.query('DELETE FROM customer_session WHERE expires_at < now()');
}

/** História rezervácií prihláseného zákazníka. */
export async function listBookings(db: Queryable, customerId: string) {
  const r = await db.query(
    `SELECT b.id, b.status, b.total_price, b.payment_status, b.created_at,
            (SELECT min(lower(br.stay)) FROM booking_room br WHERE br.booking_id = b.id) AS first_night,
            (SELECT count(*) FROM booking_room br WHERE br.booking_id = b.id)::int AS room_count,
            (SELECT count(*) FROM booking_service bs WHERE bs.booking_id = b.id)::int AS service_count
       FROM booking b
      WHERE b.customer_id = $1
      ORDER BY b.created_at DESC
      LIMIT 100`,
    [customerId],
  );
  return r.rows;
}
