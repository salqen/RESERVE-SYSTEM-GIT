export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/admin-api';
import { getSessionToken } from '@/lib/admin-session';
import LoginForm from './form';

export default async function AdminLoginPage() {
  // Ak je session ešte platná, netreba znova otravovať formulárom.
  // Pozor: redirect() hádže špeciálnu výnimku, preto musí byť mimo try/catch.
  let alreadyLoggedIn = false;
  if (getSessionToken()) {
    try {
      await getMe();
      alreadyLoggedIn = true;
    } catch {
      alreadyLoggedIn = false;
    }
  }
  if (alreadyLoggedIn) redirect('/admin');

  return (
    <div className="admin-login-wrap">
      <div className="admin-login">
        <h1>Prihlásenie</h1>
        <p className="sub">Správa rezervácií a obsadenosti</p>
        <LoginForm />
      </div>
    </div>
  );
}
