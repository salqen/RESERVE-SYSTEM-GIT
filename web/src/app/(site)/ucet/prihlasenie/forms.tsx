'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, registerAction, type AccountFormState } from '../actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Odosielam…' : label}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useFormState<AccountFormState, FormData>(loginAction, {});

  return (
    <form action={action} className="card">
      <h2>Prihlásenie</h2>
      {state.error && <div className="alert error">{state.error}</div>}

      <label className="field">E-mail
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label className="field">Heslo
        <input type="password" name="password" autoComplete="current-password" required />
      </label>

      <Submit label="Prihlásiť sa" />
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useFormState<AccountFormState, FormData>(registerAction, {});

  return (
    <form action={action} className="card">
      <h2>Nová registrácia</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Ak ste u nás už rezervovali bez účtu, použite ten istý e-mail – uvidíte aj staršie rezervácie.
      </p>
      {state.error && <div className="alert error">{state.error}</div>}

      <label className="field">Meno a priezvisko
        <input type="text" name="name" autoComplete="name" required />
      </label>
      <label className="field">E-mail
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label className="field">Telefón (nepovinné)
        <input type="tel" name="phone" autoComplete="tel" />
      </label>
      <label className="field">Heslo
        <input
          type="password" name="password" autoComplete="new-password"
          required minLength={12}
        />
      </label>
      <p className="muted" style={{ marginBottom: 12 }}>Heslo musí mať aspoň 12 znakov.</p>

      <Submit label="Vytvoriť účet" />
    </form>
  );
}
