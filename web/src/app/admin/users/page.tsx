export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getMe, getUsers, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from '../shell';
import { toggleUserAction } from '../actions';
import NewUserForm from './new-user-form';

function dateTime(iso: string | null): string {
  if (!iso) return '—';
  return `${iso.slice(8, 10)}. ${iso.slice(5, 7)}. ${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export default async function AdminUsersPage() {
  let me, list;
  try {
    me = await getMe();
    if (me.user.role !== 'owner') redirect('/admin');
    list = await getUsers();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    throw err;
  }

  return (
    <AdminShell
      user={me.user}
      title="Používatelia"
      subtitle={`${list.users.length} účtov`}
    >

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Meno</th><th>Rola</th><th>Stav</th>
              <th>Posledné prihlásenie</th><th>Aktívne sessions</th><th />
            </tr>
          </thead>
          <tbody>
            {list.users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  <div className="sub">{u.email}</div>
                </td>
                <td className="sub">{u.role === 'owner' ? 'Owner' : 'Personál'}</td>
                <td>
                  <span className={`badge ${u.active ? 'confirmed' : 'cancelled'}`}>
                    {u.active ? 'Aktívny' : 'Deaktivovaný'}
                  </span>
                </td>
                <td className="sub">{dateTime(u.last_login_at)}</td>
                <td className="sub">{u.active_sessions}</td>
                <td>
                  {u.id !== me.user.id && (
                    <form action={toggleUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="active" value={String(!u.active)} />
                      <button className={`btn${u.active ? ' danger' : ''}`} type="submit">
                        {u.active ? 'Deaktivovať' : 'Aktivovať'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section">
        <h2 className="section-title">Nový účet</h2>
        <NewUserForm />
      </section>
    </AdminShell>
  );
}
