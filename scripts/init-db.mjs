/**
 * Idempotentná inicializácia DB – bezpečné spúšťať pri každom deploji
 * (Railway pre-deploy command). Nepotrebuje psql, používa balík pg.
 *
 * Postup:
 *  1. Ak schéma ešte neexistuje → vytvorí ju z db/schema.sql a všetky
 *     existujúce migrácie označí ako aplikované (baseline – schema.sql je
 *     vždy aktuálny obraz sveta, migrácie by nad ním padli).
 *  2. Ak schéma existuje → aplikuje len tie migrácie z db/migrations,
 *     ktoré ešte nie sú v tabuľke schema_migration.
 *
 * Každá migrácia beží vo vlastnej transakcii – buď prejde celá, alebo nič.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[init-db] DATABASE_URL nie je nastavené');
  process.exit(1);
}

const dbDir = path.dirname(fileURLToPath(new URL('../db/schema.sql', import.meta.url)));
const migrationsDir = path.join(dbDir, 'migrations');

const MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migration (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

/** Migrácie zoradené podľa názvu (001_, 002_, …). */
function migrationFiles() {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const existing = await client.query(`SELECT to_regclass('public.booking') AS t`);

  if (!existing.rows[0].t) {
    // Čerstvá databáza – celá schéma naraz + baseline migrácií.
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(path.join(dbDir, 'schema.sql'), 'utf8'));
      await client.query(MIGRATION_TABLE);
      for (const file of migrationFiles()) {
        await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [file]);
      }
      await client.query('COMMIT');
      console.log('[init-db] schéma vytvorená (baseline vrátane migrácií)');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } else {
    await client.query(MIGRATION_TABLE);

    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migration')).rows.map((r) => r.filename),
    );
    const pending = migrationFiles().filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('[init-db] schéma je aktuálna – žiadne nové migrácie');
    }

    for (const file of pending) {
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(path.join(migrationsDir, file), 'utf8'));
        await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[init-db] migrácia aplikovaná: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[init-db] migrácia zlyhala: ${file}`);
        throw err;
      }
    }
  }
} finally {
  await client.end();
}
