'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createUserAction, type UserFormState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'Vytváram…' : 'Vytvoriť účet'}
    </button>
  );
}

export default function NewUserForm() {
  const [state, formAction] = useFormState<UserFormState, FormData>(createUserAction, {});

  return (
    <form action={formAction} className="card" style={{ maxWidth: 420 }}>
      {state.error && <div className="alert error">{state.error}</div>}
      {state.ok && <div className="alert ok">{state.ok}</div>}

      <div className="field">
        <label className="label" htmlFor="new-email">E-mail</label>
        <input className="input" id="new-email" name="email" type="email" required />
      </div>

      <div className="field">
        <label className="label" htmlFor="new-name">Meno</label>
        <input className="input" id="new-name" name="name" type="text" required />
      </div>

      <div className="field">
        <label className="label" htmlFor="new-password">Heslo</label>
        <input
          className="input" id="new-password" name="password" type="password"
          autoComplete="new-password" required minLength={12}
        />
        <p className="sub" style={{ marginTop: 5 }}>Aspoň 12 znakov.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="new-role">Rola</label>
        <select className="input" id="new-role" name="role" defaultValue="staff">
          <option value="staff">Personál – kalendár a rezervácie</option>
          <option value="owner">Owner – navyše správa používateľov</option>
        </select>
      </div>

      <Submit />
    </form>
  );
}
