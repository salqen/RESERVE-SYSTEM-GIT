'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="admin-btn primary" type="submit" disabled={pending} style={{ width: '100%', justifyContent: 'center' }}>
      {pending ? 'Prihlasujem…' : 'Prihlásiť sa'}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction}>
      {state.error && <div className="admin-alert error">{state.error}</div>}

      <div className="admin-field">
        <label className="admin-label" htmlFor="email">E-mail</label>
        <input
          className="admin-input" id="email" name="email" type="email"
          autoComplete="username" required autoFocus
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="password">Heslo</label>
        <input
          className="admin-input" id="password" name="password" type="password"
          autoComplete="current-password" required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
