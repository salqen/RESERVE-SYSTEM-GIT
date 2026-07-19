/**
 * Fáza 3 – outbox sender: mapuje eventy zo sync_outbox na volania keepi ERP.
 *
 * Volá ho outbox worker (src/jobs/cleanup.ts). Ak volanie zlyhá (výpadok ERP),
 * worker event nechá v 'pending' s exponenciálnym backoffom – rezervácia
 * medzitým normálne platí (front-run + dodatočná synchronizácia).
 */
import { pool, Queryable } from '../../db';
import { KeepiClient, buildInvoiceBasis, BookingForInvoice, RoomLineRow, ServiceLineRow } from './keepi';

export type OutboxSender = (target: string, eventType: string, payload: any) => Promise<void>;

export function makeErpSender(client: KeepiClient, db: Queryable = pool): OutboxSender {
  return async (target, eventType, payload) => {
    if (target !== 'erp') {
      // service_manager notifikácie zatiaľ len logujeme – kanál (e-mail/Slack)
      // sa dopne podľa prevádzky; event označíme za spracovaný.
      console.log(`[outbox→${target}] ${eventType}`, JSON.stringify(payload));
      return;
    }

    switch (eventType) {
      case 'booking.confirmed': {
        const bookingId: string = payload.bookingId;
        const b = await db.query(
          `SELECT b.id, b.total_price, c.name AS customer_name, c.email AS customer_email, c.erp_customer_id
             FROM booking b JOIN customer c ON c.id = b.customer_id
            WHERE b.id = $1`,
          [bookingId],
        );
        if (b.rows.length === 0) return; // rezervácia medzitým zmizla – nič neposielame
        const rooms = await db.query(
          `SELECT r.name AS room_name, lower(br.stay) AS check_in, upper(br.stay) AS check_out, br.price
             FROM booking_room br JOIN room r ON r.id = br.room_id
            WHERE br.booking_id = $1`,
          [bookingId],
        );
        const services = await db.query(
          `SELECT s.name AS service_name, lower(bs.time_slot) AS starts_at, upper(bs.time_slot) AS ends_at, bs.price
             FROM booking_service bs JOIN service s ON s.id = bs.service_id
            WHERE bs.booking_id = $1`,
          [bookingId],
        );
        const basis = buildInvoiceBasis(
          b.rows[0] as BookingForInvoice,
          rooms.rows as RoomLineRow[],
          services.rows as ServiceLineRow[],
        );
        const { invoiceId } = await client.createInvoiceBasis(basis);
        await db.query(`UPDATE booking SET erp_invoice_id = $2 WHERE id = $1`, [bookingId, invoiceId]);
        break;
      }
      case 'booking.cancelled': {
        await client.registerCancellation({
          bookingId: payload.bookingId,
          refund: Number(payload.refund ?? 0),
          fee: Number(payload.fee ?? 0),
        });
        break;
      }
      default:
        // Neznámy event nezhadzujeme do nekonečného retry – zalogujeme a potvrdíme.
        console.warn(`[outbox→erp] neznámy event_type ${eventType} – preskakujem`);
    }
  };
}
