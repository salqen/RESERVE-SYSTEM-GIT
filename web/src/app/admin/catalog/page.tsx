export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getAdminCatalog, getMe, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from '../shell';
import { toggleCatalogItemAction } from '../actions';
import { NewRoomForm, NewServiceForm } from './forms';
import { eur, minutesLabel } from '@/lib/format';

function ToggleButton({ id, kind, active }: { id: string; kind: string; active: boolean }) {
  return (
    <form action={toggleCatalogItemAction}>
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="active" value={String(!active)} />
      <button className={`admin-btn${active ? ' danger' : ''}`} type="submit">
        {active ? 'Skryť z webu' : 'Zverejniť'}
      </button>
    </form>
  );
}

export default async function AdminCatalogPage() {
  let me, catalog;
  try {
    [me, catalog] = await Promise.all([getMe(), getAdminCatalog()]);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    throw err;
  }

  const policyName = (id: string | null) =>
    id ? (catalog.policies.find((p) => p.id === id)?.name ?? '—') : 'plné vrátenie';
  const resourceName = (id: string) =>
    catalog.resources.find((r) => r.id === id)?.name ?? '—';

  return (
    <AdminShell user={me.user} active="catalog" subtitle="Katalóg">
      <div className="admin-head">
        <span className="admin-title">Katalóg</span>
        <span className="admin-range">
          {catalog.rooms.filter((r) => r.active).length} izieb a{' '}
          {catalog.services.filter((s) => s.active).length} služieb na webe
        </span>
      </div>

      <section className="admin-section" style={{ marginTop: 0 }}>
        <h2>Izby</h2>
        {catalog.rooms.length === 0 && <p className="admin-empty">Zatiaľ žiadne izby.</p>}
        {catalog.rooms.length > 0 && (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Názov</th><th>Typ</th><th>Kapacita</th><th>Cena / noc</th>
                  <th>Min. nocí</th><th>Storno</th><th>Stav</th><th />
                </tr>
              </thead>
              <tbody>
                {catalog.rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="admin-sub">{r.room_type}</td>
                    <td className="admin-sub">{r.capacity} os.</td>
                    <td>{eur(r.price_night)}</td>
                    <td className="admin-sub">{r.min_nights}</td>
                    <td className="admin-sub">{policyName(r.cancellation_policy_id)}</td>
                    <td>
                      <span className={`admin-badge ${r.active ? 'confirmed' : 'cancelled'}`}>
                        {r.active ? 'Na webe' : 'Skrytá'}
                      </span>
                    </td>
                    <td><ToggleButton id={r.id} kind="room" active={r.active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <NewRoomForm policies={catalog.policies} />
        </div>
      </section>

      <section className="admin-section">
        <h2>Služby</h2>
        {catalog.services.length === 0 && <p className="admin-empty">Zatiaľ žiadne služby.</p>}
        {catalog.services.length > 0 && (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Názov</th><th>Trvanie</th><th>Príprava</th><th>Cena</th>
                  <th>Kto poskytuje</th><th>Storno</th><th>Stav</th><th />
                </tr>
              </thead>
              <tbody>
                {catalog.services.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="admin-sub">{minutesLabel(s.duration_min)}</td>
                    <td className="admin-sub">{s.buffer_min > 0 ? `${s.buffer_min} min` : '—'}</td>
                    <td>{eur(s.price)}</td>
                    <td className="admin-sub">
                      {s.resource_ids.length === 0
                        ? <span style={{ color: 'var(--err)' }}>nikto – nedá sa rezervovať</span>
                        : s.resource_ids.map(resourceName).join(', ')}
                    </td>
                    <td className="admin-sub">{policyName(s.cancellation_policy_id)}</td>
                    <td>
                      <span className={`admin-badge ${s.active ? 'confirmed' : 'cancelled'}`}>
                        {s.active ? 'Na webe' : 'Skrytá'}
                      </span>
                    </td>
                    <td><ToggleButton id={s.id} kind="service" active={s.active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <NewServiceForm policies={catalog.policies} resources={catalog.resources.filter((r) => r.active)} />
        </div>
      </section>
    </AdminShell>
  );
}
