/**
 * Outbox sender pre e-maily. Číta údaje rezervácie, vyrenderuje šablónu
 * a odošle. Doručený e-mail zapíše do `email_log`.
 *
 * `email_log` má UNIQUE (booking_id, template), takže opakovaný retry po
 * čiastočnom zlyhaní neposiela zákazníkovi to isté dvakrát.
 */
import { pool, Queryable, UNIQUE_VIOLATION } from '../../db';
import { Mailer } from './mailer';
import {
  renderConfirmation, renderCancellation,
  type BookingEmailData, type CancellationEmailData,
} from './templates';
import type { OutboxSender } from '../erp/sender';

/** Načíta všetko, čo šablóny potrebujú. Vráti null, ak rezervácia zmizla. */
export async function loadBookingEmailData(
  db: Queryable, bookingId: string, webOrigin: string,
): Promise<(BookingEmailData & { recipient: string }) | null> {
  const b = await db.query(
    `SELECT b.id, b.total_price, c.name AS customer_name, c.email AS customer_email
       FROM booking b JOIN customer c ON c.id = b.customer_id
      WHERE b.id = $1`,
    [bookingId],
  );
  if (b.rows.length === 0) return null;

  const rooms = await db.query(
    `SELECT r.name, lower(br.stay)::text AS check_in, upper(br.stay)::text AS check_out, br.price
       FROM booking_room br JOIN room r ON r.id = br.room_id
      WHERE br.booking_id = $1 ORDER BY lower(br.stay)`,
    [bookingId],
  );
  const services = await db.query(
    `SELECT s.name, lower(bs.time_slot)::text AS starts_at, bs.price
       FROM booking_service bs JOIN service s ON s.id = bs.service_id
      WHERE bs.booking_id = $1 ORDER BY lower(bs.time_slot)`,
    [bookingId],
  );

  return {
    bookingId,
    customerName: b.rows[0].customer_name,
    recipient: b.rows[0].customer_email,
    totalPrice: Number(b.rows[0].total_price),
    rooms: rooms.rows.map((r: any) => ({
      name: r.name, checkIn: r.check_in, checkOut: r.check_out, price: Number(r.price),
    })),
    services: services.rows.map((s: any) => ({
      name: s.name, startsAt: s.starts_at, price: Number(s.price),
    })),
    detailUrl: webOrigin ? `${webOrigin.replace(/\/$/, '')}/bookings/${bookingId}` : undefined,
  };
}

export function makeEmailSender(
  mailer: Mailer, webOrigin: string, db: Queryable = pool,
): OutboxSender {
  return async (target, eventType, payload) => {
    if (target !== 'email') return;

    const bookingId: string = payload.bookingId;
    const data = await loadBookingEmailData(db, bookingId, webOrigin);
    if (!data) return; // rezervácia medzitým zmizla – nie je komu písať

    let template: string;
    let rendered;

    switch (eventType) {
      case 'booking.confirmed':
        template = 'confirmation';
        rendered = renderConfirmation(data);
        break;
      case 'booking.cancelled':
        template = 'cancellation';
        rendered = renderCancellation({
          ...data,
          refundTotal: Number(payload.refund ?? 0),
          feeTotal: Number(payload.fee ?? 0),
        } as CancellationEmailData);
        break;
      default:
        console.warn(`[email] neznámy event_type ${eventType} – preskakujem`);
        return;
    }

    // Poistka pred odoslaním: ak už rovnaká šablóna pre túto rezerváciu
    // odišla, druhýkrát ju neposielame.
    const already = await db.query(
      'SELECT 1 FROM email_log WHERE booking_id = $1 AND template = $2',
      [bookingId, template],
    );
    if (already.rows.length > 0) return;

    const result = await mailer.send({
      to: data.recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    if (result.status === 'skipped') return; // mailer vypnutý – nič nelogujeme

    try {
      await db.query(
        `INSERT INTO email_log (booking_id, recipient, template, subject, provider_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [bookingId, data.recipient, template, rendered.subject, result.providerId ?? null],
      );
    } catch (err) {
      // Súbeh dvoch workerov – e-mail odišiel, záznam už existuje.
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
    }
  };
}
