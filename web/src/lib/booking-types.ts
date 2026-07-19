/**
 * Typy booking flow – KÓPIA z backendu (src/modules/bookings/types.ts).
 * Web je samostatne buildovateľný (Railway Root Directory = web), preto
 * nemôže importovať mimo svojej zložky. Pri zmene kontraktu uprav OBA súbory.
 */

export interface RoomItem { roomId: string; checkIn: string; checkOut: string }
export interface ServiceItem { serviceId: string; resourceId: string; startsAt: string }

export interface CreateHoldInput {
  idempotencyKey: string;
  customer: { erpCustomerId?: string; name: string; email: string; phone?: string };
  rooms: RoomItem[];
  services: ServiceItem[];
  note?: string;
}
