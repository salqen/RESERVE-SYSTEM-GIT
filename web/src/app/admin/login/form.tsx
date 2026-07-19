'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending} style={{ width: '100%', justifyContent: 'center' }}>
      {pending ? 'Prihlasujem…' : 'Prihlásiť sa'}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction}>
      {state.error && <div className="alert error">{state.error}</div>}

      <div className="field">
        <label className="label" htmlFor="email">E-mail</label>
        <input
          className="input" id="email" name="email" type="email"
          autoComplete="username" required autoFocus
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">Heslo</label>
        <input
          className="input" id="password" name="password" type="password"
          autoComplete="current-password" required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
