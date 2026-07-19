import { pool, Queryable } from '../db';
import { config } from '../config';
import { KeepiClient } from '../modules/erp/keepi';
import { makeErpSender, OutboxSender } from '../modules/erp/sender';

/**
 * Cleanup job: ruší expirované holdy → uvoľní termín.
 * Beží každú minútu (spúšťa index.ts).
 */
export async function expireHolds(db: Queryable = pool): Promise<number> {
  const { rows } = await db.query(
    `UPDATE booking SET status = 'cancelled'
      WHERE status = 'hold' AND hold_expires_at <= now()
      RETURNING id`,
  );
  for (const r of rows) {
    await db.query(
      `INSERT INTO audit_log (booking_id, actor, action, detail)
       VALUES ($1, 'system', 'expire', '{}')`,
      [r.id],
    );
  }
  return rows.length;
}

/**
 * Outbox worker: posiela pending eventy do ERP / service managera.
 * Pri chybe sendera event ostáva v 'pending' s exponenciálnym backoffom
 * (1, 2, 4, 8... minút, strop 60), po 10 pokusoch 'failed'.
 */
export async function processOutbox(sender: OutboxSender, db: Queryable = pool) {
  const { rows } = await db.query(
    `SELECT id, target, event_type, payload FROM sync_outbox
      WHERE status = 'pending' AND next_retry <= now()
      ORDER BY id LIMIT 20`,
  );
  for (const row of rows) {
    try {
      await sender(row.target, row.event_type, row.payload);
      await db.query(`UPDATE sync_outbox SET status = 'sent' WHERE id = $1`, [row.id]);
    } catch {
      await db.query(
        `UPDATE sync_outbox
            SET attempts = attempts + 1,
                next_retry = now() + make_interval(mins => least(power(2, attempts)::int, 60)),
                status = CASE WHEN attempts + 1 >= 10 THEN 'failed' ELSE 'pending' END
          WHERE id = $1`,
        [row.id],
      );
    }
  }
  return rows.length;
}

export function startJobs() {
  // Fáza 3: reálny adaptér na keepi ERP. Bez KEEPI_API_URL sender zlyhá
  // a eventy čakajú v outboxe (retry) – bezpečný default pre dev.
  const keepi = new KeepiClient({ apiUrl: config.keepiApiUrl, apiKey: config.keepiApiKey });
  const sender = makeErpSender(keepi);

  setInterval(() => {
    expireHolds().catch((e) => console.error('expireHolds:', e.message));
    processOutbox(sender).catch((e) => console.error('processOutbox:', e.message));
  }, 60_000);
}
