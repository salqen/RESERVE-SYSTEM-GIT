export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getOverview, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from './shell';
import { IconArrowIn, IconArrowOut, IconAlert } from './icons';
import { eur } from '@/lib/format';

const ATTENTION_TEXT: Record<string, (label: string) => string> = {
  service_no_resource: (l) => `Služba „${l}" nemá priradený zdroj – zákazník neuvidí žiadny voľný termín.`,
  resource_no_hours: (l) => `Zdroj „${l}" nemá pracovný čas – jeho služby sa nedajú rezervovať.`,
  no_active_rooms: (l) => l,
};

function Metric({
  label, value, note, accent,
}: {
  label: string; value: string; note?: string; accent?: boolean;
}) {
  return (
    <div className="card metric">
      <span className="metric-label">{label}</span>
      <span className={`metric-value${accent ? ' accent' : ''}`}>{value}</span>
      {note && <span className="metric-note">{note}</span>}
    </div>
  );
}

export default async function AdminOverviewPage() {
  let me, overview;
  try {
    [me, overview] = await Promise.all([getMe(), getOverview()]);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    throw err;
  }

  const m = overview.metrics;
  const occupancy = m.rooms_active > 0
    ? Math.round((m.occupied_tonight / m.rooms_active) * 100)
    : 0;

  const today = new Date().toLocaleDateString('sk-SK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AdminShell
      user={me.user}
      title={`Dobrý deň, ${me.user.name.split(' ')[0]}`}
      subtitle={today}
      actions={<Link className="btn primary" href="/admin/kalendar">Otvoriť kalendár</Link>}
    >
      {overview.attention.length > 0 && (
        <div className="alert error" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <IconAlert size={18} />
          <div>
            {overview.attention.map((a, i) => (
              <div key={i} style={{ marginBottom: i < overview.attention.length - 1 ? 6 : 0 }}>
                {(ATTENTION_TEXT[a.kind] ?? ((l: string) => l))(a.label)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cards">
        <Metric
          label="Obsadenosť dnes v noci"
          value={`${occupancy} %`}
          note={`${m.occupied_tonight} z ${m.rooms_active} izieb`}
          accent
        />
        <Metric
          label="Príchody dnes"
          value={String(m.arrivals_today)}
          note={m.departures_today > 0 ? `${m.departures_today} odchodov` : 'žiadne odchody'}
        />
        <Metric
          label="Tržby tento mesiac"
          value={eur(m.revenue_month)}
          note={`${m.confirmed_total} potvrdených rezervácií celkovo`}
        />
        <Metric
          label="Čakajúce holdy"
          value={String(m.active_holds)}
          note={m.unpaid_count > 0 ? `${m.unpaid_count} nezaplatených` : 'všetko zaplatené'}
        />
      </div>

      <section className="section">
        <h2 className="section-title">Dnes</h2>
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconArrowIn size={15} /> Príchody
            </h3>
            {overview.arrivals.length === 0 && <p className="sub">Dnes nikto neprichádza.</p>}
            {overview.arrivals.map((a) => (
              <div key={`${a.id}-${a.room_name}`} className="log" style={{ borderTop: 'none', paddingTop: 0 }}>
                <Link href={`/admin/bookings/${a.id}`}><strong>{a.customer_name}</strong></Link>
                <span className="sub">{a.room_name} · do {a.check_out.slice(0, 10)}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconArrowOut size={15} /> Odchody
            </h3>
            {overview.departures.length === 0 && <p className="sub">Dnes nikto neodchádza.</p>}
            {overview.departures.map((d) => (
              <div key={`${d.id}-${d.room_name}`} className="log" style={{ borderTop: 'none', paddingTop: 0 }}>
                <Link href={`/admin/bookings/${d.id}`}><strong>{d.customer_name}</strong></Link>
                <span className="sub">{d.room_name} · od {d.check_in.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Synchronizácia</h2>
        <div className="cards">
          <Metric
            label="Čaká na odoslanie"
            value={String(m.outbox_pending)}
            note="ERP a e-maily"
          />
          <Metric
            label="Zlyhané po 10 pokusoch"
            value={String(m.outbox_failed)}
            note={m.outbox_failed > 0 ? 'vyžaduje pozornosť' : 'nič nezlyhalo'}
          />
        </div>
      </section>
    </AdminShell>
  );
}
