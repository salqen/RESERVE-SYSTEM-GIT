/**
 * Fáza 3 – webhooky od externých systémov.
 * Oba overujú HMAC-SHA256 podpis raw tela (hlavička `x-signature`);
 * raw telo ukladá express.json verify hook v index.ts.
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { config } from '../../config';
import { verifySignature } from './signature';
import { registerTimeoff } from './timeoff';

export const webhooksRouter = Router();

function rawBodyOf(req: Request): Buffer {
  return (req as any).rawBody ?? Buffer.from('');
}

/**
 * POST /webhooks/keepi/payment – keepi hlási stav platby faktúry.
 * Body: { invoiceId, status: 'paid' | 'refunded' | 'unpaid' }
 */
webhooksRouter.post('/keepi/payment', async (req, res, next) => {
  try {
    if (!verifySignature(rawBodyOf(req), req.header('x-signature'), config.keepiWebhookSecret)) {
      return res.status(401).json({ error: 'Neplatný podpis' });
    }
    const body = z.object({
      invoiceId: z.string().min(1),
      status: z.enum(['unpaid', 'paid', 'refunded']),
    }).parse(req.body);

    const upd = await pool.query(
      `UPDATE booking SET payment_status = $2 WHERE erp_invoice_id = $1 RETURNING id`,
      [body.invoiceId, body.status],
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Faktúra nie je priradená k rezervácii' });

    await pool.query(
      `INSERT INTO audit_log (booking_id, actor, action, detail)
       VALUES ($1, 'erp', 'payment_status', $2)`,
      [upd.rows[0].id, JSON.stringify(body)],
    );
    res.json({ bookingId: upd.rows[0].id, paymentStatus: body.status });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Neplatný vstup', detail: err.issues });
    next(err);
  }
});

/**
 * POST /webhooks/service-manager/timeoff – zmena dostupnosti personálu.
 * Body: { resourceId, start, end, reason? }
 * Odpoveď obsahuje konflikty s existujúcimi rezerváciami (manuálne riešenie).
 */
webhooksRouter.post('/service-manager/timeoff', async (req, res, next) => {
  try {
    if (!verifySignature(rawBodyOf(req), req.header('x-signature'), config.serviceManagerWebhookSecret)) {
      return res.status(401).json({ error: 'Neplatný podpis' });
    }
    const body = z.object({
      resourceId: z.string().uuid(),
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
      reason: z.string().optional(),
    }).parse(req.body);
    if (body.start >= body.end) return res.status(400).json({ error: 'start musí byť pred end' });

    const result = await registerTimeoff(body);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Neplatný vstup', detail: err.issues });
    next(err);
  }
});
