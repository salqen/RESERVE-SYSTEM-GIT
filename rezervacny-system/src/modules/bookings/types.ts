/**
 * Zdieľané typy booking flow – bez runtime závislostí (žiadny import pg/express),
 * aby ich mohol type-only importovať aj zákaznícky web (web/src/lib/api.ts).
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
