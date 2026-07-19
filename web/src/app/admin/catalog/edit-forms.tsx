'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  updateRoomAction, updateServiceAction, addPriceRuleAction,
  createResourceAction, setResourceHoursAction, type CatalogFormState,
} from '../actions';
import type {
  CatalogRoomRow, CatalogServiceRow, CatalogResourceRow, PriceRuleRow,
} from '@/lib/admin-api';

const WEEKDAYS = [
  { value: 1, label: 'Pondelok' }, { value: 2, label: 'Utorok' },
  { value: 3, label: 'Streda' }, { value: 4, label: 'Štvrtok' },
  { value: 5, label: 'Piatok' }, { value: 6, label: 'Sobota' },
  { value: 0, label: 'Nedeľa' },
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="admin-btn primary" type="submit" disabled={pending}>
      {pending ? 'Ukladám…' : label}
    </button>
  );
}

function Feedback({ state }: { state: CatalogFormState }) {
  if (state.error) return <div className="admin-alert error">{state.error}</div>;
  if (state.ok) return <div className="admin-alert ok">{state.ok}</div>;
  return null;
}

function PolicySelect({
  policies, selected, id,
}: {
  policies: { id: string; name: string }[]; selected: string | null; id: string;
}) {
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor={id}>Storno politika</label>
      <select className="admin-input" id={id} name="cancellation_policy_id" defaultValue={selected ?? ''}>
        <option value="">Bez politiky – plné vrátenie</option>
        {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------- izba

export function EditRoomForm({
  room, policies, prices,
}: {
  room: CatalogRoomRow;
  policies: { id: string; name: string }[];
  prices: PriceRuleRow[];
}) {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(updateRoomAction, {});
  const [priceState, priceAction] = useFormState<CatalogFormState, FormData>(addPriceRuleAction, {});

  return (
    <details className="admin-card" style={{ marginTop: 8 }}>
      <summary className="admin-summary">Upraviť {room.name}</summary>

      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />
        <input type="hidden" name="roomId" value={room.id} />

        <div className="admin-field">
          <label className="admin-label" htmlFor={`rn-${room.id}`}>Názov</label>
          <input className="admin-input" id={`rn-${room.id}`} name="name" defaultValue={room.name} required />
        </div>

        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`rt-${room.id}`}>Typ</label>
            <input className="admin-input" id={`rt-${room.id}`} name="room_type" defaultValue={room.room_type} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`rc-${room.id}`}>Kapacita</label>
            <input className="admin-input" id={`rc-${room.id}`} name="capacity" type="number" min={1} defaultValue={room.capacity} />
          </div>
        </div>

        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`rp-${room.id}`}>Základná cena / noc (€)</label>
            <input className="admin-input" id={`rp-${room.id}`} name="price_night" type="number" min={0} step="0.01" defaultValue={room.price_night} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`rm-${room.id}`}>Minimum nocí</label>
            <input className="admin-input" id={`rm-${room.id}`} name="min_nights" type="number" min={1} defaultValue={room.min_nights} />
          </div>
        </div>

        <PolicySelect policies={policies} selected={room.cancellation_policy_id} id={`rpol-${room.id}`} />
        <Submit label="Uložiť zmeny" />
      </form>

      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <h4 className="admin-label" style={{ marginBottom: 8 }}>Sezónne ceny</h4>
        {prices.length === 0 && (
          <p className="admin-sub">Žiadne sezóny – po celý rok platí základná cena.</p>
        )}
        <form action={priceAction} style={{ maxWidth: 460, marginTop: 10 }}>
          <Feedback state={priceState} />
          <input type="hidden" name="roomId" value={room.id} />
          <div className="admin-grid-2">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`sf-${room.id}`}>Od</label>
              <input className="admin-input" id={`sf-${room.id}`} name="season_from" type="date" required />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`st-${room.id}`}>Do (nezahrnuté)</label>
              <input className="admin-input" id={`st-${room.id}`} name="season_to" type="date" required />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`sp-${room.id}`}>Cena za noc v sezóne (€)</label>
            <input className="admin-input" id={`sp-${room.id}`} name="price_night" type="number" min={0} step="0.01" required />
          </div>
          <Submit label="Pridať sezónu" />
        </form>
      </div>
    </details>
  );
}

// ----------------------------------------------------------------- služba

export function EditServiceForm({
  service, policies, resources,
}: {
  service: CatalogServiceRow;
  policies: { id: string; name: string }[];
  resources: CatalogResourceRow[];
}) {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(updateServiceAction, {});

  return (
    <details className="admin-card" style={{ marginTop: 8 }}>
      <summary className="admin-summary">Upraviť {service.name}</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />
        <input type="hidden" name="serviceId" value={service.id} />

        <div className="admin-field">
          <label className="admin-label" htmlFor={`sn-${service.id}`}>Názov</label>
          <input className="admin-input" id={`sn-${service.id}`} name="name" defaultValue={service.name} required />
        </div>

        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`sd-${service.id}`}>Trvanie (min)</label>
            <input className="admin-input" id={`sd-${service.id}`} name="duration_min" type="number" min={5} step={5} defaultValue={service.duration_min} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`sb-${service.id}`}>Príprava po (min)</label>
            <input className="admin-input" id={`sb-${service.id}`} name="buffer_min" type="number" min={0} step={5} defaultValue={service.buffer_min} />
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor={`sp2-${service.id}`}>Cena (€)</label>
          <input className="admin-input" id={`sp2-${service.id}`} name="price" type="number" min={0} step="0.01" defaultValue={service.price} />
        </div>

        <div className="admin-field">
          <span className="admin-label">Kto alebo čo ju poskytuje</span>
          {resources.map((r) => (
            <label key={r.id} className="admin-check">
              <input
                type="checkbox" name="resource_ids" value={r.id}
                defaultChecked={service.resource_ids.includes(r.id)}
              />
              {r.name}
            </label>
          ))}
        </div>

        <PolicySelect policies={policies} selected={service.cancellation_policy_id} id={`spol-${service.id}`} />
        <Submit label="Uložiť zmeny" />
      </form>
    </details>
  );
}

// ------------------------------------------------------------------ zdroje

export function NewResourceForm() {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(createResourceAction, {});

  return (
    <details className="admin-card">
      <summary className="admin-summary">Pridať zdroj</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />

        <div className="admin-field">
          <label className="admin-label" htmlFor="res-name">Názov</label>
          <input className="admin-input" id="res-name" name="name" required placeholder="Jana – masérka" />
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="res-type">Typ</label>
          <select className="admin-input" id="res-type" name="resource_type" defaultValue="staff">
            <option value="staff">Personál</option>
            <option value="room">Miestnosť</option>
            <option value="equipment">Zariadenie</option>
          </select>
        </div>

        <Submit label="Pridať zdroj" />
      </form>
    </details>
  );
}

export function ResourceHoursForm({ resource }: { resource: CatalogResourceRow }) {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(setResourceHoursAction, {});
  const byDay = new Map(resource.hours.map((h) => [h.weekday, h]));

  return (
    <details className="admin-card" style={{ marginTop: 8 }}>
      <summary className="admin-summary">Pracovný čas – {resource.name}</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />
        <input type="hidden" name="resourceId" value={resource.id} />

        {WEEKDAYS.map((day) => {
          const existing = byDay.get(day.value);
          return (
            <div key={day.value} className="admin-day-row">
              <label className="admin-check" style={{ minWidth: 118 }}>
                <input type="checkbox" name={`day-${day.value}`} defaultChecked={!!existing} />
                {day.label}
              </label>
              <input
                className="admin-input" type="time" name={`open-${day.value}`}
                defaultValue={existing?.open ?? '09:00'} aria-label={`${day.label} od`}
              />
              <span className="admin-sub">–</span>
              <input
                className="admin-input" type="time" name={`close-${day.value}`}
                defaultValue={existing?.close ?? '17:00'} aria-label={`${day.label} do`}
              />
            </div>
          );
        })}

        <p className="admin-sub" style={{ margin: '10px 0 12px' }}>
          Nezaškrtnuté dni znamenajú voľno. Bez rozvrhu sa služby tohto zdroja nedajú rezervovať.
        </p>
        <Submit label="Uložiť rozvrh" />
      </form>
    </details>
  );
}
