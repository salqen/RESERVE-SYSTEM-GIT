export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBooking, getMe, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from '../../shell';
import { eur } from '@/lib/format';
import CancelButton from './cancel-button';

const STATUS_LABEL: Record<string, string> = {
  hold: 'Hold', confirmed: 'Potvrdená', cancelled: 'Zrušená',
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Nezaplatené', paid: 'Zaplatené', refunded: 'Vrátené',
};

function dateTime(iso: string): string {
  return `${iso.slice(8, 10)}. ${iso.slice(5, 7)}. ${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export default async function AdminBookingDetail({ params }: { params: { id: string } }) {
  let me, booking;
  try {
    [me, booking] = await Promise.all([getMe(), getBooking(params.id)]);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    if (err instanceof Error && /neexistuje/i.test(err.message)) notFound();
    throw err;
  }

  const canCancel = booking.status === 'hold' || booking.status === 'confirmed';

  return (
    <AdminShell
      user={me.user}
      title={booking.customer_name}
      subtitle={`Rezervácia z ${dateTime(booking.created_at)}`}
      actions={
        <>
          <span className={`badge ${booking.status}`}>{STATUS_LABEL[booking.status]}</span>
          <Link className="btn" href="/admin/bookings">← Späť na zoznam</Link>
          {canCancel && <CancelButton bookingId={booking.id} />}
        </>
      }
    >

      <div className="bento">
        <div className="card t6">
          <h3>Zákazník</h3>
          <dl className="dl">
            <dt>E-mail</dt><dd>{booking.customer_email}</dd>
            <dt>Telefón</dt><dd>{booking.customer_phone ?? '—'}</dd>
            <dt>Vytvorená</dt><dd>{dateTime(booking.created_at)}</dd>
            {booking.note && (<><dt>Poznámka</dt><dd>{booking.note}</dd></>)}
          </dl>
        </div>

        <div className="card t6">
          <h3>Platba</h3>
          <dl className="dl">
            <dt>Suma</dt><dd>{eur(booking.total_price)}</dd>
            <dt>Stav platby</dt><dd>{PAYMENT_LABEL[booking.payment_status] ?? booking.payment_status}</dd>
            <dt>Faktúra v ERP</dt><dd>{booking.erp_invoice_id ?? 'zatiaľ nevystavená'}</dd>
            {booking.hold_expires_at && booking.status === 'hold' && (
              <><dt>Hold platí do</dt><dd>{dateTime(booking.hold_expires_at)}</dd></>
            )}
          </dl>
        </div>
      </div>

      {booking.rooms.length > 0 && (
        <section className="section">
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Izby</span></div>
            <div className="table-scroll panel-body flush">
            <table className="table">
              <thead>
                <tr><th>Izba</th><th>Príchod</th><th>Odchod</th><th>Cena</th><th>Stav</th></tr>
              </thead>
              <tbody>
                {booking.rooms.map((r) => (
                  <tr key={`${r.room_id}-${r.check_in}`}>
                    <td>{r.name}</td>
                    <td className="sub">{r.check_in.slice(0, 10)}</td>
                    <td className="sub">{r.check_out.slice(0, 10)}</td>
                    <td>{eur(r.price)}</td>
                    <td><span className={`badge ${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {booking.services.length > 0 && (
        <section className="section">
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Služby</span></div>
            <div className="table-scroll panel-body flush">
            <table className="table">
              <thead>
                <tr><th>Služba</th><th>Kto/kde</th><th>Začiatok</th><th>Cena</th><th>Stav</th></tr>
              </thead>
              <tbody>
                {booking.services.map((s) => (
                  <tr key={`${s.service_id}-${s.starts_at}`}>
                    <td>{s.name}</td>
                    <td className="sub">{s.resource_name ?? '—'}</td>
                    <td className="sub">{dateTime(s.starts_at)}</td>
                    <td>{eur(s.price)}</td>
                    <td><span className={`badge ${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">História zmien</span></div>
          <div className="panel-body flush">
            {booking.audit.length === 0 && <p className="empty">Žiadne záznamy.</p>}
            <div className="rows">
              {booking.audit.map((a, i) => (
                <div key={`${a.created_at}-${i}`} className="row-line">
                  <strong style={{ color: 'var(--volt-2)', fontWeight: 600 }}>{a.action}</strong>
                  <span className="sub">{a.actor}</span>
                  <span className="right sub">{dateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
