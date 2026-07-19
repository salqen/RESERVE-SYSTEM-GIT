import { getBooking } from '@/lib/api';
import { eur, dateLabel, dateTimeLabel } from '@/lib/format';
import { cancelBookingAction } from '../../book/actions';

const statusLabel: Record<string, string> = {
  hold: 'Čaká na platbu',
  confirmed: 'Potvrdená',
  cancelled: 'Zrušená',
};

/** Detail rezervácie – slúži aj ako samoobsluha (odkaz z potvrdzovacieho e-mailu). */
export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { paid?: string; cancelled?: string; refund?: string; fee?: string; error?: string };
}) {
  let booking;
  try {
    booking = await getBooking(params.id);
  } catch {
    return <div className="alert error">Rezervácia neexistuje.</div>;
  }

  return (
    <>
      <h1>Rezervácia</h1>
      <p>
        <span className={`badge ${booking.status}`}>{statusLabel[booking.status] ?? booking.status}</span>{' '}
        <span className="muted">č. {booking.id.slice(0, 8)}</span>
      </p>

      {searchParams.paid && (
        <div className="alert success">
          Platba prebehla, rezervácia je potvrdená. Potvrdenie posielame na {booking.customer_email}.
        </div>
      )}
      {searchParams.cancelled && (
        <div className="alert success">
          Rezervácia bola zrušená.
          {Number(searchParams.refund) > 0 && <> Vrátime vám {eur(searchParams.refund!)}.</>}
          {Number(searchParams.fee) > 0 && <> Storno poplatok: {eur(searchParams.fee!)}.</>}
        </div>
      )}
      {searchParams.error && <div className="alert error">{searchParams.error}</div>}

      <div className="card">
        {booking.rooms.map((r) => (
          <p key={r.room_id}>
            <strong>{r.name}</strong> · {dateLabel(r.check_in)} – {dateLabel(r.check_out)} · {eur(r.price)}
          </p>
        ))}
        {booking.services.map((s) => (
          <p key={s.service_id}>
            <strong>{s.name}</strong> · {dateTimeLabel(s.starts_at)} · {eur(s.price)}
          </p>
        ))}
        <p className="row">
          <span>Spolu</span>
          <strong>{eur(booking.total_price)}</strong>
        </p>
        <small className="muted">{booking.customer_name} · {booking.customer_email}</small>
      </div>

      {booking.status !== 'cancelled' && (
        <form action={cancelBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <button className="btn danger" type="submit">Zrušiť rezerváciu</button>
          <p><small className="muted">
            Výška vrátenej sumy sa riadi storno podmienkami – čím skôr rušíte, tým viac vám vrátime.
          </small></p>
        </form>
      )}
    </>
  );
}
