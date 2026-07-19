export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getBookings, getMe, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from '../shell';
import { eur } from '@/lib/format';

const STATUS_LABEL: Record<string, string> = {
  hold: 'Hold',
  confirmed: 'Potvrdená',
  cancelled: 'Zrušená',
};

const FILTERS = [
  { key: '', label: 'Všetky' },
  { key: 'confirmed', label: 'Potvrdené' },
  { key: 'hold', label: 'Holdy' },
  { key: 'cancelled', label: 'Zrušené' },
];

function dateTime(iso: string): string {
  return `${iso.slice(8, 10)}. ${iso.slice(5, 7)}. ${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string };
}) {
  const q = (searchParams.q ?? '').trim();
  const status = FILTERS.some((f) => f.key === searchParams.status) ? searchParams.status! : '';
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  let me, list;
  try {
    [me, list] = await Promise.all([getMe(), getBookings({ q, status, page })]);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    throw err;
  }

  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    for (const [k, v] of Object.entries(over)) v ? p.set(k, v) : p.delete(k);
    const qs = p.toString();
    return `/admin/bookings${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminShell
      user={me.user}
      title="Rezervácie"
      subtitle={`${list.total} celkovo`}
    >
      <form className="filters" action="/admin/bookings" method="get">
        <input
          className="input" type="search" name="q" defaultValue={q}
          placeholder="Meno, e-mail alebo ID rezervácie" style={{ maxWidth: 320 }}
          aria-label="Hľadať rezerváciu"
        />
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn" type="submit">Hľadať</button>
        {(q || status) && <Link className="btn" href="/admin/bookings">Zrušiť filter</Link>}
      </form>

      <div className="chips">
        {FILTERS.map((f) => (
          <Link
            key={f.key || 'all'}
            className={`chip${f.key === status ? ' on' : ''}`}
            href={link({ status: f.key, page: '' })}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">
            {status ? FILTERS.find((f) => f.key === status)?.label : 'Všetky rezervácie'}
          </span>
          <span className="grow" />
          <span className="panel-note">{list.total} záznamov</span>
        </div>

        {list.bookings.length === 0 && (
          <div className="panel-body">
            <p className="empty">
              {q || status ? 'Filtru nezodpovedá žiadna rezervácia.' : 'Zatiaľ nie sú žiadne rezervácie.'}
            </p>
          </div>
        )}

        {list.bookings.length > 0 && (
        <div className="table-scroll panel-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Zákazník</th>
                <th>Položky</th>
                <th>Prvá noc</th>
                <th>Suma</th>
                <th>Stav</th>
                <th>Vytvorená</th>
              </tr>
            </thead>
            <tbody>
              {list.bookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/bookings/${b.id}`}>{b.customer_name}</Link>
                    <div className="sub">{b.customer_email}</div>
                  </td>
                  <td className="sub">
                    {b.room_count > 0 && `${b.room_count}× izba`}
                    {b.room_count > 0 && b.service_count > 0 && ', '}
                    {b.service_count > 0 && `${b.service_count}× služba`}
                  </td>
                  <td className="sub">
                    {b.first_night ? b.first_night.slice(0, 10) : '—'}
                  </td>
                  <td>{eur(b.total_price)}</td>
                  <td>
                    <span className={`badge ${b.status}`}>{STATUS_LABEL[b.status]}</span>
                  </td>
                  <td className="sub">{dateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {list.totalPages > 1 && (
        <div className="filters" style={{ marginTop: 16 }}>
          {page > 1 && <Link className="btn" href={link({ page: String(page - 1) })}>← Predošlé</Link>}
          <span className="sub">Strana {page} z {list.totalPages}</span>
          {page < list.totalPages && (
            <Link className="btn" href={link({ page: String(page + 1) })}>Ďalšie →</Link>
          )}
        </div>
      )}
    </AdminShell>
  );
}
