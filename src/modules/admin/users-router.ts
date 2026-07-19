/**
 * Správa admin účtov. Celý router je dostupný len role `owner`.
 *
 * Zámerne tu nie je mazanie účtu – účty sa deaktivujú, aby v audit logu
 * zostalo dohľadateľné, kto v minulosti čo urobil.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requireOwner } from './auth';
import { hashPassword, validatePassword } from './password';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireOwner);

adminUsersRouter.get('/', async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.active, u.created_at, u.last_login_at,
              (SELECT count(*) FROM admin_session s
                WHERE s.user_id = u.id AND s.expires_at > now())::int AS active_sessions
         FROM admin_user u ORDER BY u.created_at`,
    );
    res.json({ users: r.rows });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().max(200),
  role: z.enum(['owner', 'staff']).default('staff'),
});

adminUsersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Vyplňte e-mail, meno a heslo' });

    const problem = validatePassword(parsed.data.password);
    if (problem) return res.status(400).json({ error: problem });

    const exists = await pool.query(
      'SELECT 1 FROM admin_user WHERE lower(email) = lower($1)', [parsed.data.email],
    );
    if (exists.rowCount) return res.status(409).json({ error: 'Účet s týmto e-mailom už existuje' });

    const hash = await hashPassword(parsed.data.password);
    const r = await pool.query(
      `INSERT INTO admin_user (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, active, created_at`,
      [parsed.data.email, parsed.data.name, hash, parsed.data.role],
    );
    res.status(201).json({ user: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['owner', 'staff']).optional(),
  active: z.boolean().optional(),
  password: z.string().max(200).optional(),
});

adminUsersRouter.patch('/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ error: 'Neplatné ID používateľa' });
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Neplatné údaje' });

    const target = await pool.query('SELECT id, role FROM admin_user WHERE id = $1', [req.params.id]);
    if (target.rowCount === 0) return res.status(404).json({ error: 'Používateľ neexistuje' });

    const isSelf = req.adminUser?.id === req.params.id;

    // Poistka proti vyradeniu posledného ownera – inak by sa nikto nedostal dnu.
    if ((parsed.data.active === false || parsed.data.role === 'staff') && target.rows[0].role === 'owner') {
      const owners = await pool.query(
        `SELECT count(*)::int AS n FROM admin_user WHERE role = 'owner' AND active AND id <> $1`,
        [req.params.id],
      );
      if (owners.rows[0].n === 0) {
        return res.status(409).json({ error: 'Musí zostať aspoň jeden aktívny owner' });
      }
    }
    if (isSelf && parsed.data.active === false) {
      return res.status(409).json({ error: 'Vlastný účet nemôžete deaktivovať' });
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    if (parsed.data.name !== undefined) { params.push(parsed.data.name); sets.push(`name = $${params.length}`); }
    if (parsed.data.role !== undefined) { params.push(parsed.data.role); sets.push(`role = $${params.length}`); }
    if (parsed.data.active !== undefined) { params.push(parsed.data.active); sets.push(`active = $${params.length}`); }
    if (parsed.data.password !== undefined) {
      const problem = validatePassword(parsed.data.password);
      if (problem) return res.status(400).json({ error: problem });
      params.push(await hashPassword(parsed.data.password));
      sets.push(`password_hash = $${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Žiadna zmena' });

    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE admin_user SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, name, role, active, created_at, last_login_at`,
      params,
    );

    // Zmena hesla alebo deaktivácia musí okamžite vyhodiť otvorené sessions.
    if (parsed.data.password !== undefined || parsed.data.active === false) {
      await pool.query('DELETE FROM admin_session WHERE user_id = $1', [req.params.id]);
    }

    res.json({ user: r.rows[0] });
  } catch (err) {
    next(err);
  }
});
