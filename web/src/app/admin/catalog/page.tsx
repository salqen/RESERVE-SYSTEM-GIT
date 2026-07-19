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

/** Hlavička položky: názov, stav a akcia. Detaily idú do riadkov pod tým. */
function ItemHead({
  name, badge, badgeOk, action,
}: {
  name: string; badge: string; badgeOk: boolean; action: React.ReactNode;
}) {
  return (
    <div className="item-head" style={{ marginBottom: 10 }}>
      <strong>{name}</strong>
      <span className={`badge ${badgeOk ? 'confirmed' : 'cancelled'}`}>{badge}</span>
      <span className="grow" />
      {action}
    </div>
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

  const roomsOn = catalog.rooms.filter((r) => r.active).length;
  const servicesOn = catalog.services.filter((s) => s.active).length;

  return (
    <AdminShell
      user={me.user}
      title="Katalóg"
      subtitle={`${roomsOn} izieb a ${servicesOn} služieb je zverejnených na webe`}
    >
      <section>
        <div className="filters" style={{ marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Izby</h2>
          <span className="grow" />
          <NewRoomForm policies={catalog.policies} />
        </div>

        {catalog.rooms.length === 0 && <p className="empty">Zatiaľ žiadne izby.</p>}

        <div className="cards">
          {catalog.rooms.map((r) => {
            const seasons = pricesFor(r.id);
            return (
              <div key={r.id} className="card">
                <ItemHead
                  name={r.name}
                  badge={r.active ? 'Na webe' : 'Skrytá'}
                  badgeOk={r.active}
                  action={<ToggleButton id={r.id} kind="room" active={r.active} />}
                />

                <div className="rows">
                  <div className="row-line">
                    Cena za noc<span className="right">{eur(r.price_night)}</span>
                  </div>
                  <div className="row-line">
                    Kapacita<span className="right">{r.capacity} os. · {r.room_type}</span>
                  </div>
                  <div className="row-line">
                    Minimum nocí<span className="right">{r.min_nights}</span>
                  </div>
                  <div className="row-line">
                    Storno<span className="right">{policyName(r.cancellation_policy_id)}</span>
                  </div>
                </div>

                {seasons.length > 0 && (
                  <div className="seasons">
                    {seasons.map((p) => (
                      <span key={p.id} className="season">
                        {p.season_from.slice(5, 10)} – {p.season_to.slice(5, 10)}: {eur(p.price_night)}
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
        </div>
      </section>

      <section className="section">
        <div className="filters" style={{ marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Služby</h2>
          <span className="grow" />
          <NewServiceForm policies={catalog.policies} resources={activeResources} />
        </div>

        {catalog.services.length === 0 && <p className="empty">Zatiaľ žiadne služby.</p>}

        <div className="cards">
          {catalog.services.map((s) => (
            <div key={s.id} className="card">
              <ItemHead
                name={s.name}
                badge={s.active ? 'Na webe' : 'Skrytá'}
                badgeOk={s.active}
                action={<ToggleButton id={s.id} kind="service" active={s.active} />}
              />

              <div className="rows">
                <div className="row-line">
                  Cena<span className="right">{eur(s.price)}</span>
                </div>
                <div className="row-line">
                  Trvanie
                  <span className="right">
                    {minutesLabel(s.duration_min)}
                    {s.buffer_min > 0 ? ` + ${s.buffer_min} min` : ''}
                  </span>
                </div>
                <div className="row-line">
                  Poskytuje
                  <span className="right">
                    {s.resource_ids.length === 0
                      ? <span style={{ color: 'var(--err)' }}>nikto – nedá sa rezervovať</span>
                      : s.resource_ids.map(resourceName).join(', ')}
                  </span>
                </div>
                <div className="row-line">
                  Storno<span className="right">{policyName(s.cancellation_policy_id)}</span>
                </div>
              </div>

              <EditServiceForm service={s} policies={catalog.policies} resources={activeResources} />
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="filters" style={{ marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Zdroje a pracovný čas</h2>
          <span className="grow" />
          <NewResourceForm />
        </div>

        {catalog.resources.length === 0 && (
          <p className="empty">Žiadne zdroje – bez nich sa služby nedajú rezervovať.</p>
        )}

        <div className="cards">
          {catalog.resources.map((r) => (
            <div key={r.id} className="card">
              <ItemHead
                name={r.name}
                badge={r.active ? 'Aktívny' : 'Vypnutý'}
                badgeOk={r.active}
                action={
                  <form action={toggleResourceAction}>
                    <input type="hidden" name="resourceId" value={r.id} />
                    <input type="hidden" name="active" value={String(!r.active)} />
                    <button className={`btn${r.active ? ' danger' : ''}`} type="submit">
                      {r.active ? 'Vypnúť' : 'Zapnúť'}
                    </button>
                  </form>
                }
              />

              <div className="rows">
                <div className="row-line">
                  Typ<span className="right">{RESOURCE_TYPE[r.resource_type] ?? r.resource_type}</span>
                </div>
                <div className="row-line">
                  Pracovný čas
                  <span className="right">
                    {r.hours.length === 0
                      ? <span style={{ color: 'var(--err)' }}>bez rozvrhu</span>
                      : r.hours.map((h) => `${WEEKDAY_SHORT[h.weekday]} ${h.open}–${h.close}`).join(', ')}
                  </span>
                </div>
              </div>

              <ResourceHoursForm resource={r} />
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
