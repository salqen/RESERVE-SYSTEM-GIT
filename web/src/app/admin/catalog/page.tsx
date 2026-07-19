export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getAdminCatalog, getMe, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from '../shell';
import { toggleCatalogItemAction, toggleResourceAction, deletePriceRuleAction } from '../actions';
import { NewRoomForm, NewServiceForm } from './forms';
import {
  EditRoomForm, EditServiceForm, NewResourceForm, ResourceHoursForm,
} from './edit-forms';
import { eur, minutesLabel } from '@/lib/format';

const WEEKDAY_SHORT = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
const RESOURCE_TYPE: Record<string, string> = {
  staff: 'personál', room: 'miestnosť', equipment: 'zariadenie',
};

function ToggleButton({ id, kind, active }: { id: string; kind: string; active: boolean }) {
  return (
    <form action={toggleCatalogItemAction}>
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="active" value={String(!active)} />
      <button className={`btn${active ? ' danger' : ''}`} type="submit">
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
  const pricesFor = (roomId: string) => catalog.prices.filter((p) => p.room_id === roomId);
  const activeResources = catalog.resources.filter((r) => r.active);

  return (
    <AdminShell
      user={me.user}
      title="Katalóg"
      subtitle={`${catalog.rooms.filter((r) => r.active).length} izieb a ${catalog.services.filter((s) => s.active).length} služieb je zverejnených na webe`}
    >
      <section className="section" style={{ marginTop: 0 }}>
        <h2 className="section-title">Izby</h2>
        {catalog.rooms.length === 0 && <p className="empty">Zatiaľ žiadne izby.</p>}

        {catalog.rooms.map((r) => {
          const seasons = pricesFor(r.id);
          return (
            <div key={r.id} className="item">
              <div className="item-head">
                <div>
                  <strong>{r.name}</strong>{' '}
                  <span className="sub">
                    {r.room_type}, {r.capacity} os. · {eur(r.price_night)}/noc
                    {r.min_nights > 1 ? ` · min. ${r.min_nights} nocí` : ''} · {policyName(r.cancellation_policy_id)}
                  </span>
                </div>
                <div className="grow" />
                <span className={`badge ${r.active ? 'confirmed' : 'cancelled'}`}>
                  {r.active ? 'Na webe' : 'Skrytá'}
                </span>
                <ToggleButton id={r.id} kind="room" active={r.active} />
              </div>

              {seasons.length > 0 && (
                <div className="seasons">
                  {seasons.map((p) => (
                    <span key={p.id} className="season">
                      {p.season_from.slice(0, 10)} – {p.season_to.slice(0, 10)}: {eur(p.price_night)}
                      <form action={deletePriceRuleAction} style={{ display: 'inline' }}>
                        <input type="hidden" name="ruleId" value={p.id} />
                        <button className="x" type="submit" aria-label="Zmazať sezónu">×</button>
                      </form>
                    </span>
                  ))}
                </div>
              )}

              <EditRoomForm room={r} policies={catalog.policies} prices={seasons} />
            </div>
          );
        })}

        <div style={{ marginTop: 14 }}>
          <NewRoomForm policies={catalog.policies} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Služby</h2>
        {catalog.services.length === 0 && <p className="empty">Zatiaľ žiadne služby.</p>}

        {catalog.services.map((s) => (
          <div key={s.id} className="item">
            <div className="item-head">
              <div>
                <strong>{s.name}</strong>{' '}
                <span className="sub">
                  {minutesLabel(s.duration_min)}
                  {s.buffer_min > 0 ? ` + ${s.buffer_min} min príprava` : ''} · {eur(s.price)} ·{' '}
                  {s.resource_ids.length === 0
                    ? <span style={{ color: 'var(--err)' }}>nikto ju neposkytuje – nedá sa rezervovať</span>
                    : s.resource_ids.map(resourceName).join(', ')}
                </span>
              </div>
              <div className="grow" />
              <span className={`badge ${s.active ? 'confirmed' : 'cancelled'}`}>
                {s.active ? 'Na webe' : 'Skrytá'}
              </span>
              <ToggleButton id={s.id} kind="service" active={s.active} />
            </div>

            <EditServiceForm service={s} policies={catalog.policies} resources={activeResources} />
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <NewServiceForm policies={catalog.policies} resources={activeResources} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Zdroje a pracovný čas</h2>
        {catalog.resources.length === 0 && (
          <p className="empty">Žiadne zdroje – bez nich sa služby nedajú rezervovať.</p>
        )}

        {catalog.resources.map((r) => (
          <div key={r.id} className="item">
            <div className="item-head">
              <div>
                <strong>{r.name}</strong>{' '}
                <span className="sub">
                  {RESOURCE_TYPE[r.resource_type] ?? r.resource_type} ·{' '}
                  {r.hours.length === 0
                    ? <span style={{ color: 'var(--err)' }}>bez rozvrhu – žiadne voľné termíny</span>
                    : r.hours.map((h) => `${WEEKDAY_SHORT[h.weekday]} ${h.open}–${h.close}`).join(', ')}
                </span>
              </div>
              <div className="grow" />
              <span className={`badge ${r.active ? 'confirmed' : 'cancelled'}`}>
                {r.active ? 'Aktívny' : 'Vypnutý'}
              </span>
              <form action={toggleResourceAction}>
                <input type="hidden" name="resourceId" value={r.id} />
                <input type="hidden" name="active" value={String(!r.active)} />
                <button className={`btn${r.active ? ' danger' : ''}`} type="submit">
                  {r.active ? 'Vypnúť' : 'Zapnúť'}
                </button>
              </form>
            </div>

            <ResourceHoursForm resource={r} />
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <NewResourceForm />
        </div>
      </section>
    </AdminShell>
  );
}
