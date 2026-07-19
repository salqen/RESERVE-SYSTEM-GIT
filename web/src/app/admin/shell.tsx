import Link from 'next/link';
import type { AdminUser } from '@/lib/admin-api';
import { logoutAction } from './actions';

/** Spoločný rám admin stránok: horná lišta, bočná navigácia, obsah. */
export default function AdminShell({
  user, active, subtitle, children,
}: {
  user: AdminUser;
  active: 'calendar' | 'bookings' | 'users';
  subtitle: string;
  children: React.ReactNode;
}) {
  const items = [
    { key: 'calendar', href: '/admin', label: 'Kalendár', glyph: '▦' },
    { key: 'bookings', href: '/admin/bookings', label: 'Rezervácie', glyph: '☰' },
    ...(user.role === 'owner'
      ? [{ key: 'users', href: '/admin/users', label: 'Používatelia', glyph: '☺' }]
      : []),
  ] as const;

  return (
    <>
      <div className="admin-top">
        <div className="admin-brand">
          <div className="admin-mark">P</div>
          <div>
            <div className="admin-brand-name">Penzión <b>admin</b></div>
            <div className="admin-brand-sub">{subtitle}</div>
          </div>
        </div>
        <div className="admin-spacer" />
        <div className="admin-who">
          <b>{user.name}</b>
          {user.email}
        </div>
        <form action={logoutAction}>
          <button className="admin-btn" type="submit">Odhlásiť</button>
        </form>
      </div>

      <div className="admin-body">
        <nav className="admin-rail" aria-label="Sekcie">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={item.key === active ? 'on' : ''}
              title={item.label}
              aria-label={item.label}
              aria-current={item.key === active ? 'page' : undefined}
            >
              {item.glyph}
            </Link>
          ))}
          <Link href="/" title="Zákaznícky web" aria-label="Zákaznícky web">↗</Link>
        </nav>

        <main className="admin-main">{children}</main>
      </div>
    </>
  );
}
