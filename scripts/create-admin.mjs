/**
 * Založenie alebo úprava admin účtu.
 *
 *   npm run build && npm run admin:create -- --email sef@penzion.sk --name "Samuel"
 *
 * Heslo sa NEZADÁVA v argumentoch (zostalo by v histórii shellu). Skript si ho
 * vypýta interaktívne so skrytým vstupom, alebo ho vezme z ADMIN_PASSWORD
 * (Railway one-off príkaz, CI).
 *
 * Ak účet s daným e-mailom existuje, prepíše mu heslo, meno a rolu.
 * Hashovanie sa importuje zo skompilovaného dist/, nech je formát hesla
 * vždy identický s tým, čo používa bežiaca aplikácia.
 */
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const passwordModule = new URL('../dist/modules/admin/password.js', import.meta.url);
if (!existsSync(fileURLToPath(passwordModule))) {
  console.error('Chýba dist/ – spusti najprv `npm run build`.');
  process.exit(1);
}
const { hashPassword, validatePassword } = await import(passwordModule.href);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/** Načíta riadok zo vstupu bez zobrazenia znakov (ak je terminál). */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('Vstup nie je terminál – použi premennú ADMIN_PASSWORD.'));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Potlačí echo písmen; otázka sa vypíše iba raz.
    let shown = false;
    rl._writeToOutput = (chunk) => {
      if (!shown) { process.stdout.write(question); shown = true; }
      else if (chunk.includes('\n')) process.stdout.write('\n');
    };
    rl.question(question, (value) => { rl.close(); resolve(value); });
  });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL nie je nastavené');
  process.exit(1);
}

const email = arg('email');
const name = arg('name') ?? email;
const role = arg('role') ?? 'owner';

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Použitie: npm run admin:create -- --email <e-mail> [--name "Meno"] [--role owner|staff]');
  process.exit(1);
}
if (!['owner', 'staff'].includes(role)) {
  console.error('Rola musí byť owner alebo staff');
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD ?? await promptHidden('Heslo: ');
const problem = validatePassword(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  const existing = await client.query(
    'SELECT id FROM admin_user WHERE lower(email) = lower($1)', [email],
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE admin_user SET password_hash = $2, name = $3, role = $4, active = true
        WHERE id = $1`,
      [existing.rows[0].id, passwordHash, name, role],
    );
    console.log(`Účet ${email} aktualizovaný (nové heslo, rola ${role}).`);
  } else {
    await client.query(
      'INSERT INTO admin_user (email, name, password_hash, role) VALUES ($1, $2, $3, $4)',
      [email, name, passwordHash, role],
    );
    console.log(`Účet ${email} vytvorený (rola ${role}).`);
  }
} finally {
  await client.end();
}
