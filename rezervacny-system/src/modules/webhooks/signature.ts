/**
 * HMAC-SHA256 podpis webhookov (keepi ERP, service manager).
 * Odosielateľ podpisuje RAW telo requestu; podpis posiela v hlavičke
 * `x-signature` ako hex. Čistá funkcia – unit testy bez HTTP.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signBody(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifySignature(rawBody: string | Buffer, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(signBody(rawBody, secret), 'hex');
  let got: Buffer;
  try {
    got = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return got.length === expected.length && timingSafeEqual(got, expected);
}
