export const dynamic = 'force-dynamic';
import { getBooking } from '@/lib/api';
import { eur, dateLabel, dateTimeLabel, timeLabel } from '@/lib/format';
import { payAndConfirmAction } from '../../book/actions';

/**
 * Krok 2 booking flow: zhrnutie holdu + platba.
 * Platobná brána je zatiaľ testovacia (tlačidlo) – integrácia reálnej brány
 * je samostatný krok (viď postup-vytvorenia.md).
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  let booking;
  try {
    booking = await getBooking(params.id);
  } catch {
    return <div className="alert error">Rezervácia neexistuje.</div>;
  }

  if (booking.status !== 'hold') {
    return (
      <>
        <h1>Platba</h1>
        <div className="alert info">
          Táto rezervácia už nie je v stave čakania na platbu –{' '}
          <a href={`/bookings/${booking.id}`}>zobraziť detail</a>.
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Platba</h1>
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
          <span>Spolu na úhradu</span>
          <strong>{eur(booking.total_price)}</strong>
        </p>
      </div>

      {booking.hold_expires_at && (
        <div className="alert info">
          Termín držíme do {timeLabel(booking.hold_expires_at)}. Potom sa uvoľní pre ďalších záujemcov.
        </div>
      )}

      <form action={payAndConfirmAction}>
        <input type="hidden" name="bookingId" value={booking.id} />
        <button className="btn" type="submit">Zaplatiť {eur(booking.total_price)} (testovacia platba)</button>
      </form>
      <p><small className="muted">Po zaplatení vám rezerváciu potvrdíme e-mailom.</small></p>
    </>
  );
}
