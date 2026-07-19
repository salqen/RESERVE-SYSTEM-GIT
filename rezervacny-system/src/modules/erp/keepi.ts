/**
 * Fáza 3 – adaptér na keepi ERP.
 *
 * Rezervačný systém posiela do ERP len PODKLAD faktúry (invoice basis);
 * daňový doklad generuje ERP. Stavy platieb sa vracajú webhookom
 * (POST /webhooks/keepi/payment – src/modules/webhooks/router.ts).
 *
 * `buildInvoiceBasis` je čistá funkcia (unit testy bez HTTP/DB);
 * `KeepiClient` je tenký HTTP klient s API kľúčom.
 */

export interface KeepiConfig {
  apiUrl: string; // prázdny = adaptér vypnutý
  apiKey: string;
}

export interface InvoiceLine {
  type: 'room' | 'service';
  description: string;
  from: string;   // ISO – začiatok pobytu / slotu
  to: string;     // ISO – koniec
  price: number;
}

export interface InvoiceBasis {
  bookingId: string;
  customer: { erpCustomerId?: string; name: string; email: string };
  lines: InvoiceLine[];
  totalPrice: number;
  currency: string;
}

export interface BookingForInvoice {
  id: string;
  total_price: string | number;
  customer_name: string;
  customer_email: string;
  erp_customer_id: string | null;
}

export interface RoomLineRow { room_name: string; check_in: string | Date; check_out: string | Date; price: string | number }
export interface ServiceLineRow { service_name: string; starts_at: string | Date; ends_at: string | Date; price: string | number }

const iso = (v: string | Date) => (v instanceof Date ? v : new Date(v)).toISOString();

/** Poskladá podklad faktúry z riadkov rezervácie. Čistá funkcia. */
export function buildInvoiceBasis(
  booking: BookingForInvoice,
  rooms: RoomLineRow[],
  services: ServiceLineRow[],
  currency = 'EUR',
): InvoiceBasis {
  const lines: InvoiceLine[] = [
    ...rooms.map((r): InvoiceLine => ({
      type: 'room',
      description: `Ubytovanie: ${r.room_name}`,
      from: iso(r.check_in),
      to: iso(r.check_out),
      price: Number(r.price),
    })),
    ...services.map((s): InvoiceLine => ({
      type: 'service',
      description: `Služba: ${s.service_name}`,
      from: iso(s.starts_at),
      to: iso(s.ends_at),
      price: Number(s.price),
    })),
  ];
  return {
    bookingId: booking.id,
    customer: {
      erpCustomerId: booking.erp_customer_id ?? undefined,
      name: booking.customer_name,
      email: booking.customer_email,
    },
    lines,
    totalPrice: Number(booking.total_price),
    currency,
  };
}

export class KeepiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export class KeepiClient {
  constructor(private cfg: KeepiConfig, private fetchFn: typeof fetch = fetch) {}

  get enabled(): boolean {
    return this.cfg.apiUrl.length > 0;
  }

  /** Pošle podklad faktúry; vráti ID faktúry v keepi. */
  async createInvoiceBasis(basis: InvoiceBasis): Promise<{ invoiceId: string }> {
    return this.req('/invoices', basis);
  }

  /** Ohlási storno (refund + storno poplatok) k existujúcej rezervácii. */
  async registerCancellation(payload: { bookingId: string; refund: number; fee: number }): Promise<void> {
    await this.req('/invoices/cancellation', payload);
  }

  private async req<T>(path: string, body: unknown): Promise<T> {
    if (!this.enabled) throw new KeepiError('keepi adaptér nie je nakonfigurovaný (KEEPI_API_URL)');
    const res = await this.fetchFn(`${this.cfg.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new KeepiError(`keepi ${path} → HTTP ${res.status}`, res.status);
    return (await res.json().catch(() => ({}))) as T;
  }
}
