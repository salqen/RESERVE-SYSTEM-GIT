'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  createRoomAction, createServiceAction, type CatalogFormState,
} from '../actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'Ukladám…' : label}
    </button>
  );
}

function Feedback({ state }: { state: CatalogFormState }) {
  if (state.error) return <div className="alert error">{state.error}</div>;
  if (state.ok) return <div className="alert ok">{state.ok}</div>;
  return null;
}

function PolicySelect({ policies }: { policies: { id: string; name: string }[] }) {
  return (
    <div className="field">
      <label className="label" htmlFor="policy">Storno politika</label>
      <select className="input" id="policy" name="cancellation_policy_id" defaultValue="">
        <option value="">Bez politiky – plné vrátenie</option>
        {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

export function NewRoomForm({ policies }: { policies: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState<CatalogFormState, FormData>(createRoomAction, {});

  return (
    <details className="card" style={{ minWidth: 300 }}>
      <summary className="disclosure">Pridať izbu</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />

        <div className="field">
          <label className="label" htmlFor="room-name">Názov</label>
          <input className="input" id="room-name" name="name" required placeholder="Izba 101 – Dvojlôžková" />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="room-type">Typ</label>
            <input className="input" id="room-type" name="room_type" defaultValue="dvojlozkova" />
          </div>
          <div className="field">
            <label className="label" htmlFor="room-capacity">Kapacita (osôb)</label>
            <input className="input" id="room-capacity" name="capacity" type="number" min={1} defaultValue={2} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="room-price">Cena za noc (€)</label>
            <input className="input" id="room-price" name="price_night" type="number" min={0} step="0.01" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="room-min">Minimum nocí</label>
            <input className="input" id="room-min" name="min_nights" type="number" min={1} defaultValue={1} />
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
    <details className="card" style={{ minWidth: 300 }}>
      <summary className="disclosure">Pridať službu</summary>
      <form action={formAction} style={{ marginTop: 14, maxWidth: 460 }}>
        <Feedback state={state} />

        <div className="field">
          <label className="label" htmlFor="svc-name">Názov</label>
          <input className="input" id="svc-name" name="name" required placeholder="Klasická masáž 60 min" />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="svc-duration">Trvanie (min)</label>
            <input className="input" id="svc-duration" name="duration_min" type="number" min={5} step={5} defaultValue={60} />
          </div>
          <div className="field">
            <label className="label" htmlFor="svc-buffer">Príprava po (min)</label>
            <input className="input" id="svc-buffer" name="buffer_min" type="number" min={0} step={5} defaultValue={15} />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="svc-price">Cena (€)</label>
          <input className="input" id="svc-price" name="price" type="number" min={0} step="0.01" required />
        </div>

        <div className="field">
          <span className="label">Kto alebo čo ju poskytuje</span>
          {resources.length === 0 && (
            <p className="sub">
              Žiadne zdroje – bez nich sa služba nedá rezervovať. Zdroje sa zatiaľ zakladajú priamo v databáze.
            </p>
          )}
          {resources.map((r) => (
            <label key={r.id} className="check">
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
