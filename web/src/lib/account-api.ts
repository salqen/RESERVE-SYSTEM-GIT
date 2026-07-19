/**
 * Klient zákazníckeho účtu. Beží len na serveri – token zostáva v
 * httpOnly cookie a do prehliadačového JS sa nedostane.
 */
import 'server-only';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
export const ACCOUNT_COOKIE = 'account_session';

export interface Customer { id: string; name: string; email: string }

export interface AccountBooking {
  id: string; status: 'hold' | 'confirmed' | 'cancelled';
  total_price: string; payment_status: string; created_at: string;
  first_night: string | null; room_count: number; service_count: number;
}

export function getAccountToken(): string | null {
  return cookies().get(ACCOUNT_COOKIE)?.value ?? null;
}

export function setAccountCookie(token: string, expiresAt: string): void {
  cookies().set({
    name: ACCOUNT_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearAccountCookie(): void {
  cookies().set({ name: ACCOUNT_COOKIE, value: '', path: '/', maxAge: 0 });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/account${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as any).error ?? 'Operácia zlyhala');
  return payload as T;
}

async function authed<T>(path: string): Promise<T | null> {
  const token = getAccountToken();
  if (!token) return null;

  const res = await fetch(`${API_URL}/account${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface AuthResult { token: string; expiresAt: string; customer: Customer }

export const accountRegister = (body: {
  name: string; email: string; password: string; phone?: string;
}) => post<AuthResult>('/register', body);

export const accountLogin = (body: { email: string; password: string }) =>
  post<AuthResult>('/login', body);

export async function accountLogout(): Promise<void> {
  const token = getAccountToken();
  if (!token) return;
  await fetch(`${API_URL}/account/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => undefined);
}

/** Prihlásený zákazník, alebo null. Nehádže – volá sa aj v hlavičke. */
export const getCurrentCustomer = async () =>
  (await authed<{ customer: Customer }>('/me').catch(() => null))?.customer ?? null;

export const getMyBookings = async () =>
  (await authed<{ bookings: AccountBooking[] }>('/bookings'))?.bookings ?? [];
