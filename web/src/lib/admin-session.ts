/**
 * Session cookie admina.
 *
 * Token drží prehliadač v httpOnly cookie – JavaScript sa k nemu nedostane,
 * číta ho výhradne server (server components a server actions), ktorý ho
 * posiela backendu v hlavičke Authorization.
 */
import 'server-only';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'admin_session';

export function getSessionToken(): string | null {
  return cookies().get(ADMIN_COOKIE)?.value ?? null;
}

export function setSessionCookie(token: string, expiresAt: string): void {
  cookies().set({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,                                   // neprístupné pre JS v prehliadači
    secure: process.env.NODE_ENV === 'production',    // v produkcii len cez HTTPS
    sameSite: 'lax',                                  // blokuje CSRF z cudzích stránok
    path: '/admin',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(): void {
  cookies().set({ name: ADMIN_COOKIE, value: '', path: '/admin', maxAge: 0 });
}
