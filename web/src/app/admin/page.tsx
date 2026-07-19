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

const STATUS_LABEL: Record<string, string> = {
  hold: 'Hold', confirmed: 'Potvrdená', cancelled: 'Zrušená',
};

const WEEKDAYS = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];

function Metric({
  label, value, note, accent, span = 't3',
}: {
  label: string; value: string; note?: string; accent?: boolean; span?: string;
}) {
  return (
    <div className={`card metric ${span}`}>
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
  const rooms = Math.max(1, m.rooms_active);
  const occupancy = m.rooms_active > 0 ? Math.round((m.occupied_tonight / rooms) * 100) : 0;
  const todayIso = new Date().toISOString().slice(0, 10);

  const today = new Date().toLocaleDateString('sk-SK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AdminShell
      user={me.user}
      title={`Dobrý deň, ${me.user.name.split(' ')[0]}`}
      subtitle={today}
      actions={
        <>
          <Link className="btn" href="/admin/bookings">Rezervácie</Link>
          <Link className="btn primary" href="/admin/kalendar">Otvoriť kalendár</Link>
        </>
      }
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

      <div className="bento">
        {/* Obsadenosť dostáva najväčšiu dlaždicu – je to hlavné číslo prevádzky. */}
        <div className="card t8">
          <h3>Obsadenosť · najbližšie dva týždne</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span className="metric-value accent">{occupancy} %</span>
            <span className="sub">dnes v noci · {m.occupied_tonight} z {m.rooms_active} izieb</span>
          </div>

          <div className="bars">
            {overview.week.map((d) => {
              const day = d.day.slice(0, 10);
              const pct = Math.min(100, Math.round((d.occupied / rooms) * 100));
              const isToday = day === todayIso;
              return (
                <div key={day} className={`bar-col${isToday ? ' today' : ''}`}>
                  <div
                    className={`bar${pct >= 100 ? ' full' : ''}`}
                    style={{ height: `${Math.max(3, pct)}%` }}
                    title={`${day}: ${d.occupied} z ${m.rooms_active} izieb (${pct} %)`}
                  />
                  <span className="bar-label">
                    {WEEKDAYS[new Date(day).getUTCDay()]}
                    <br />
                    {Number(day.slice(8, 10))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Metric
          label="Tržby tento mesiac"
          value={eur(m.revenue_month)}
          note={`${m.confirmed_total} potvrdených rezervácií`}
          span="t4"
        />

        <Metric label="Príchody dnes" value={String(m.arrivals_today)} note="check-in" />
        <Metric label="Odchody dnes" value={String(m.departures_today)} note="check-out" />
        <Metric
          label="Čakajúce holdy"
          value={String(m.active_holds)}
          note="nepotvrdené rezervácie"
        />
        <Metric
          label="Nezaplatené"
          value={String(m.unpaid_count)}
          note={m.unpaid_count > 0 ? 'vyžaduje pozornosť' : 'všetko zaplatené'}
        />

        {/* Príchody a odchody – zoznamy, nie prázdne obdĺžniky. */}
        <div className="panel t6">
          <div className="panel-head">
            <IconArrowIn size={16} />
            <span className="panel-title">Príchody dnes</span>
            <span className="grow" />
            <span className="panel-note">{overview.arrivals.length}</span>
          </div>
          <div className="panel-body flush">
            {overview.arrivals.length === 0 && <p className="empty">Dnes nikto neprichádza.</p>}
            <div className="rows">
              {overview.arrivals.map((a) => (
                <div key={`${a.id}-${a.room_name}`} className="row-line">
                  <Link href={`/admin/bookings/${a.id}`}>{a.customer_name}</Link>
                  <span className="right sub">{a.room_name} · do {a.check_out.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel t6">
          <div className="panel-head">
            <IconArrowOut size={16} />
            <span className="panel-title">Odchody dnes</span>
            <span className="grow" />
            <span className="panel-note">{overview.departures.length}</span>
          </div>
          <div className="panel-body flush">
            {overview.departures.length === 0 && <p className="empty">Dnes nikto neodchádza.</p>}
            <div className="rows">
              {overview.departures.map((d) => (
                <div key={`${d.id}-${d.room_name}`} className="row-line">
                  <Link href={`/admin/bookings/${d.id}`}>{d.customer_name}</Link>
                  <span className="right sub">{d.room_name} · od {d.check_in.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel t8">
          <div className="panel-head">
            <span className="panel-title">Posledné rezervácie</span>
            <span className="grow" />
            <Link className="btn ghost" href="/admin/bookings">Všetky</Link>
          </div>
          <div className="panel-body flush">
            {overview.recent.length === 0 && <p className="empty">Zatiaľ žiadne rezervácie.</p>}
            <div className="rows">
              {overview.recent.map((b) => (
                <div key={b.id} className="row-line">
                  <Link href={`/admin/bookings/${b.id}`}>{b.customer_name}</Link>
                  <span className={`badge ${b.status}`}>{STATUS_LABEL[b.status]}</span>
                  <span className="right">
                    {eur(b.total_price)}
                    <br />
                    <span className="sub">{b.created_at.slice(0, 10)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel t4">
          <div className="panel-head">
            <span className="panel-title">Synchronizácia</span>
          </div>
          <div className="panel-body">
            <div className="rows">
              <div className="row-line">
                Čaká na odoslanie
                <span className="right">{m.outbox_pending}</span>
              </div>
              <div className="row-line">
                Zlyhané
                <span className="right" style={{ color: m.outbox_failed > 0 ? 'var(--err)' : undefined }}>
                  {m.outbox_failed}
                </span>
              </div>
            </div>
            <p className="sub" style={{ marginTop: 12 }}>
              Eventy do ERP a e-maily. Zlyhané sa po 10 pokusoch zastavia a čakajú na zásah.
            </p>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
