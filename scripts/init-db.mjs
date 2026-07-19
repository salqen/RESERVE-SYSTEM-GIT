/**
 * Idempotentná inicializácia DB schémy – bezpečné spúšťať pri každom deploji
 * (Railway pre-deploy command). Ak už tabuľka `booking` existuje, nič nerobí.
 * Nepotrebuje psql – používa balík pg z dependencies.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL nie je nastavené');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const r = await client.query(`SELECT to_regclass('public.booking') AS t`);
  if (r.rows[0].t) {
    console.log('[init-db] schéma už existuje – preskakujem');
  } else {
    const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    await client.query(sql);
    console.log('[init-db] schéma vytvorená');
  }
} finally {
  await client.end();
}
