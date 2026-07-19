export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer, getMyBookings } from '@/lib/account-api';
import { logoutAction } from './actions';
import { eur } from '@/lib/format';

const STATUS_LABEL: Record<string, string> = {
  hold: 'Čaká na potvrdenie',
  confirmed: 'Potvrdená',
  cancelled: 'Zrušená',
};

function dateOnly(iso: string): string {
  return `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;
}

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/ucet/prihlasenie');

  const bookings = await getMyBookings();
  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && b.first_night && b.first_night.slice(0, 10) >= new Date().toISOString().slice(0, 10),
  );

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>Môj účet</h1>
          <p className="muted">{customer.name} · {customer.email}</p>
        </div>
        <form action={logoutAction}>
          <button className="btn secondary" type="submit">Odhlásiť sa</button>
        </form>
      </div>

      {bookings.length === 0 && (
        <div className="alert info" style={{ marginTop: 18 }}>
          Zatiaľ tu nemáte žiadne rezervácie. <Link href="/">Vyberte si termín</Link> a začnite.
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h2>Nadchádzajúce pobyty</h2>
          {upcoming.map((b) => (
            <div className="card row" key={b.id}>
              <div>
                <strong>{b.first_night ? dateOnly(b.first_night) : 'Termín podľa služby'}</strong>
                <br />
                <small className="muted">
                  {b.room_count > 0 && `${b.room_count}× izba`}
                  {b.room_count > 0 && b.service_count > 0 && ', '}
                  {b.service_count > 0 && `${b.service_count}× služba`}
                  {' · '}{eur(b.total_price)}
                </small>
              </div>
              <Link className="btn secondary" href={`/bookings/${b.id}`}>Detail</Link>
            </div>
          ))}
        </>
      )}

      {bookings.length > 0 && (
        <>
          <h2>Všetky rezervácie</h2>
          {bookings.map((b) => (
            <div className="card row" key={b.id}>
              <div>
                <strong>{b.first_night ? dateOnly(b.first_night) : 'Bez pobytu'}</strong>{' '}
                <span className="muted">({STATUS_LABEL[b.status] ?? b.status})</span>
                <br />
                <small className="muted">
                  Vytvorená {dateOnly(b.created_at)} · {eur(b.total_price)}
                </small>
              </div>
              <Link className="btn secondary" href={`/bookings/${b.id}`}>Detail</Link>
            </div>
          ))}
        </>
      )}
    </>
  );
}
