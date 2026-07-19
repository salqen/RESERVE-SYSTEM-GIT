/**
 * Klient na admin API. Beží LEN na serveri – session token sa nikdy
 * nedostane do prehliadačového JS.
 */
import 'server-only';
import { getSessionToken } from './admin-session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Signalizuje, že session vypršala – stránka presmeruje na prihlásenie. */
export class UnauthorizedError extends Error {
  constructor() { super('Neautorizovaný prístup'); }
}

async function adminReq<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  if (!token) throw new UnauthorizedError();

  const res = await fetch(`${API_URL}/admin${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (res.status === 401) throw new UnauthorizedError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error ?? `HTTP ${res.status}`);
  return body as T;
}

// ---------------------------------------------------------------- prihlásenie

export interface AdminUser {
  id: string; email: string; name: string; role: 'owner' | 'staff';
}

export interface LoginResult {
  token: string; expiresAt: string; user: AdminUser;
}

/** Prihlásenie – jediné volanie, ktoré nepotrebuje existujúcu session. */
export async function apiLogin(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error ?? 'Prihlásenie zlyhalo');
  return body as LoginResult;
}

export async function apiLogout(): Promise<void> {
  const token = getSessionToken();
  if (!token) return;
  await fetch(`${API_URL}/admin/auth/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => undefined); // odhlásenie nesmie padnúť na chybe siete
}

export const getMe = () => adminReq<{ user: AdminUser }>('/auth/me');

// ------------------------------------------------------------------ kalendár

export interface CalendarBooking {
  bookingId: string; checkIn: string; checkOut: string;
  status: 'hold' | 'confirmed'; customer: string | null;
}
export interface CalendarRoom {
  room_id: string; room_name: string; room_type: string; bookings: CalendarBooking[];
}
export interface CalendarBusy {
  kind: 'booking'; start: string; end: string; status: string; serviceId: string;
}
export interface CalendarTimeoff {
  kind: 'timeoff'; start: string; end: string; reason: string | null;
}
export interface CalendarResource {
  resource_id: string; resource_name: string; resource_type: string;
  busy: CalendarBusy[]; timeoff: CalendarTimeoff[];
}
export interface CalendarResponse {
  from: string; to: string; rooms: CalendarRoom[]; resources: CalendarResource[];
}

export const getCalendar = (from: string, to: string) =>
  adminReq<CalendarResponse>(
    `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
