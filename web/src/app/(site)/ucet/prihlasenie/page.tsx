export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/account-api';
import { LoginForm, RegisterForm } from './forms';

export default async function AccountLoginPage() {
  // Prihlásený zákazník nemá čo robiť na prihlasovacej stránke.
  if (await getCurrentCustomer()) redirect('/ucet');

  return (
    <>
      <h1>Môj účet</h1>
      <p className="muted">Prihláste sa alebo si založte účet a majte svoje rezervácie na jednom mieste.</p>

      <div className="two-col">
        <LoginForm />
        <RegisterForm />
      </div>
    </>
  );
}
