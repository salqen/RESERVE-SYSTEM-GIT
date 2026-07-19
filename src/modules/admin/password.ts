/**
 * Hashovanie hesiel – scrypt zo štandardnej knižnice Node.
 *
 * Prečo scrypt a nie argon2/bcrypt: obe sú natívne závislosti, ktoré sa musia
 * kompilovať pri deploji. scrypt je zabudovaný, pamäťovo náročný (odolný voči
 * GPU útokom) a na tento rozsah plne postačuje.
 *
 * Formát uloženého hashu: `scrypt$N$r$p$<salt-base64>$<hash-base64>`
 * Parametre sú súčasťou reťazca, takže sa dajú v budúcnosti sprísniť bez
 * znehodnotenia existujúcich hesiel.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt potrebuje ~128 * N * r bajtov; default maxmem (32 MB) je málo. */
const MAX_MEM = 128 * PARAMS.N * PARAMS.r * 2;

export const MIN_PASSWORD_LENGTH = 12;

/** Vráti chybu, ak heslo nespĺňa minimálne požiadavky, inak null. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Heslo musí mať aspoň ${MIN_PASSWORD_LENGTH} znakov`;
  }
  if (/^\s|\s$/.test(password)) {
    return 'Heslo nesmie začínať ani končiť medzerou';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Overí heslo proti uloženému hashu. Nikdy nehádže výnimku pri poškodenom
 * zázname – vráti false, aby útočník nevedel rozlíšiť príčinu zlyhania.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;

    const options = { N: Number(n), r: Number(r), p: Number(p) };
    if (!Number.isFinite(options.N) || !Number.isFinite(options.r) || !Number.isFinite(options.p)) {
      return false;
    }

    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      ...options,
      maxmem: 128 * options.N * options.r * 2,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
