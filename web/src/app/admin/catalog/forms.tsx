'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  createRoomAction, createServiceAction, type CatalogFormState,
} from '../actions';

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

function PolicySelect({ policies }: { policies: { id: string; name: string }[] }) {
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor="policy">Storno politika</label>
      <select className="admin-input" id="policy" name="cancellation_policy_id" defaultValue="">
        <option value="">Bez politiky – plné vrátenie</option>
        {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

export function NewRoomForm({ policies }: { policies: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(createRoomAction, {});

  return (
    <details className="admin-card">
      <summary className="admin-summary">Pridať izbu</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />

        <div className="admin-field">
          <label className="admin-label" htmlFor="room-name">Názov</label>
          <input className="admin-input" id="room-name" name="name" required placeholder="Izba 101 – Dvojlôžková" />
        </div>

        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-label" htmlFor="room-type">Typ</label>
            <input className="admin-input" id="room-type" name="room_type" defaultValue="dvojlozkova" />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="room-capacity">Kapacita (osôb)</label>
            <input className="admin-input" id="room-capacity" name="capacity" type="number" min={1} defaultValue={2} />
          </div>
        </div>

        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-label" htmlFor="room-price">Cena za noc (€)</label>
            <input className="admin-input" id="room-price" name="price_night" type="number" min={0} step="0.01" required />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="room-min">Minimum nocí</label>
            <input className="admin-input" id="room-min" name="min_nights" type="number" min={1} defaultValue={1} />
          </div>
        </div>

        <PolicySelect policies={policies} />
        <Submit label="Pridať izbu" />
      </form>
    </details>
  );
}

export function NewServiceForm({
  policies, resources,
}: {
  policies: { id: string; name: string }[];
  resources: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(createServiceAction, {});

  return (
    <details className="admin-card">
      <summary className="admin-summary">Pridať službu</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />

        <div className="admin-field">
          <label className="admin-label" htmlFor="svc-name">Názov</label>
          <input className="admin-input" id="svc-name" name="name" required placeholder="Klasická masáž 60 min" />
        </div>

        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-label" htmlFor="svc-duration">Trvanie (min)</label>
            <input className="admin-input" id="svc-duration" name="duration_min" type="number" min={5} step={5} defaultValue={60} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="svc-buffer">Príprava po (min)</label>
            <input className="admin-input" id="svc-buffer" name="buffer_min" type="number" min={0} step={5} defaultValue={15} />
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="svc-price">Cena (€)</label>
          <input className="admin-input" id="svc-price" name="price" type="number" min={0} step="0.01" required />
        </div>

        <div className="admin-field">
          <span className="admin-label">Kto alebo čo ju poskytuje</span>
          {resources.length === 0 && (
            <p className="admin-sub">
              Žiadne zdroje – bez nich sa služba nedá rezervovať. Zdroje sa zatiaľ zakladajú priamo v databáze.
            </p>
          )}
          {resources.map((r) => (
            <label key={r.id} className="admin-check">
              <input type="checkbox" name="resource_ids" value={r.id} />
              {r.name}
            </label>
          ))}
        </div>

        <PolicySelect policies={policies} />
        <Submit label="Pridať službu" />
      </form>
    </details>
  );
}
