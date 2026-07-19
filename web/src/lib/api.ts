/**
 * Typovaný klient na backend API. Beží LEN na serveri (server components
 * a server actions) – API_URL sa nedostane do prehliadača.
 *
 * Zdieľané typy: vstup holdu sa importuje type-only priamo z backendu
 * (@backend/* → ../rezervacny-system/src/*), takže kontrakt drží kompilátor.
 */
import 'server-only';
import type { CreateHoldInput } from './booking-types';

export type { CreateHoldInput, RoomItem, ServiceItem } from './booking-types';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    cache: 'no-store', // dostupnosť sa nesmie cachovať
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as any).error ?? `HTTP ${res.status}`, res.status);
  return body as T;
}

// ---------------------------------------------------------------- katalóg

export interface CatalogRoom {
  id: string; name: string; room_type: string; capacity: number;
  price_night: string; min_nights: number;
}
export interface CatalogService {
  id: string; name: string; duration_min: number; buffer_min: number; price: string;
}

export const getCatalog = () =>
  req<{ rooms: CatalogRoom[]; services: CatalogService[] }>('/catalog');

// ------------------------------------------------------------ dostupnosť

export interface FreeRoom extends CatalogRoom {}

export const getFreeRooms = (from: string, to: string) =>
  req<{ from: string; to: string; rooms: FreeRoom[] }>(
    `/availability/rooms?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export interface ServiceSlots {
  service: string; date: string; slotMinutes: number;
  resources: { resourceId: string; resourceName: string; freeSlots: string[] }[];
}

export const getServiceSlots = (serviceId: string, date: string) =>
  req<ServiceSlots>(`/availability/services/${serviceId}?date=${encodeURIComponent(date)}`);

// ---------------------------------------------------------- booking flow

export interface HoldResult {
  bookingId: string; status: 'hold'; totalPrice: number; holdExpiresAt: string;
}

export const createHold = (input: CreateHoldInput) =>
  req<HoldResult>('/bookings/hold', { method: 'POST', body: JSON.stringify(input) });

export const confirmBooking = (bookingId: string) =>
  req<{ bookingId: string; status: 'confirmed' }>(`/bookings/${bookingId}/confirm`, { method: 'POST' });

export interface CancelResult {
  bookingId: string; status: 'cancelled'; refundTotal: number; feeTotal: number;
}

export const cancelBooking = (bookingId: string) =>
  req<CancelResult>(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ actor: 'web' }),
  });

export interface BookingDetail {
  id: string; status: 'hold' | 'confirmed' | 'cancelled';
  total_price: string; hold_expires_at: string | null; created_at: string;
  customer_name: string; customer_email: string;
  rooms: { room_id: string; name: string; check_in: string; check_out: string; price: string }[];
  services: { service_id: string; name: string; resource_id: string; starts_at: string; price: string }[];
}

export const getBooking = (bookingId: string) => req<BookingDetail>(`/bookings/${bookingId}`);
