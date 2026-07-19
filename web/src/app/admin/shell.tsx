import type { AdminUser } from '@/lib/admin-api';
import { logoutAction } from './actions';
import Sidebar from './sidebar';
import { IconLogout } from './icons';

/**
 * Rám admin rozhrania: horná lišta, vysúvateľné bočné menu, obsah.
 * Titulok a akcie stránky idú do hlavičky obsahu, nie do topbaru – topbar
 * patrí identite a odhláseniu, aby sa nemiešali dve úrovne navigácie.
 */
export default function AdminShell({
  user, title, subtitle, actions, children,
}: {
  user: AdminUser;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const initials = user.name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '').join('') || 'A';

  return (
    <div className="admin-root">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span className="brand-text">
            <span className="brand-name">Penzión</span>
            <span className="brand-sub">Správa rezervácií</span>
          </span>
        </div>

        <div className="grow" />

        <div className="who">
          <span className="who-avatar" aria-hidden="true">{initials}</span>
          <span className="who-text">
            <span className="who-name">{user.name}</span>
            <span className="who-role">{user.role === 'owner' ? 'Owner' : 'Personál'}</span>
          </span>
        </div>

        <form action={logoutAction}>
          <button className="btn ghost" type="submit">
            <IconLogout size={17} />
            <span className="btn-label">Odhlásiť</span>
          </button>
        </form>
      </header>

      <div className="shell">
        <Sidebar role={user.role} />

        <main className="content">
          <div className="page-head">
            <div>
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="page-sub">{subtitle}</p>}
            </div>
            {actions && <div className="page-actions">{actions}</div>}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
