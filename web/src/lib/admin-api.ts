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

// ---------------------------------------------------------------- rezervácie

export type BookingStatus = 'hold' | 'confirmed' | 'cancelled';

export interface BookingListItem {
  id: string; status: BookingStatus; total_price: string;
  payment_status: string; created_at: string; hold_expires_at: string | null;
  customer_name: string; customer_email: string;
  room_count: number; service_count: number; first_night: string | null;
}

export interface BookingList {
  bookings: BookingListItem[];
  page: number; pageSize: number; total: number; totalPages: number;
}

export function getBookings(params: { q?: string; status?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('status', params.status);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return adminReq<BookingList>(`/bookings${qs ? `?${qs}` : ''}`);
}

export interface BookingDetail {
  id: string; status: BookingStatus; total_price: string; payment_status: string;
  erp_invoice_id: string | null; hold_expires_at: string | null; created_at: string;
  note: string | null;
  customer_name: string; customer_email: string; customer_phone: string | null;
  rooms: { room_id: string; name: string; status: string; check_in: string; check_out: string; price: string }[];
  services: { service_id: string; name: string; status: string; resource_name: string | null; starts_at: string; ends_at: string; price: string }[];
  audit: { actor: string; action: string; detail: unknown; created_at: string }[];
}

export const getBooking = (id: string) => adminReq<BookingDetail>(`/bookings/${id}`);

export const cancelBookingAsAdmin = (id: string) =>
  adminReq<unknown>(`/bookings/${id}/cancel`, { method: 'POST', body: '{}' });

// ------------------------------------------------------------- používatelia

export interface AdminUserRow extends AdminUser {
  active: boolean; created_at: string; last_login_at: string | null; active_sessions: number;
}

export const getUsers = () => adminReq<{ users: AdminUserRow[] }>('/users');

export const createUser = (body: { email: string; name: string; password: string; role: string }) =>
  adminReq<{ user: AdminUserRow }>('/users', { method: 'POST', body: JSON.stringify(body) });

export const updateUser = (
  id: string,
  body: { name?: string; role?: string; active?: boolean; password?: string },
) => adminReq<{ user: AdminUserRow }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
