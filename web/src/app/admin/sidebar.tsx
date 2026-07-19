'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconDashboard, IconCalendar, IconBookings, IconCatalog,
  IconUsers, IconRoadmap, IconExternal, IconChevronLeft,
} from './icons';

const STORAGE_KEY = 'admin-sidebar-collapsed';

interface Item {
  href: string;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
  ownerOnly?: boolean;
  /** Presná zhoda cesty – inak by „/admin" svietilo na každej podstránke. */
  exact?: boolean;
}

const ITEMS: Item[] = [
  { href: '/admin', label: 'Prehľad', icon: IconDashboard, exact: true },
  { href: '/admin/kalendar', label: 'Kalendár', icon: IconCalendar },
  { href: '/admin/bookings', label: 'Rezervácie', icon: IconBookings },
  { href: '/admin/catalog', label: 'Katalóg', icon: IconCatalog },
  { href: '/admin/users', label: 'Používatelia', icon: IconUsers, ownerOnly: true },
  { href: '/admin/roadmap', label: 'Stav projektu', icon: IconRoadmap },
];

export default function Sidebar({ role }: { role: 'owner' | 'staff' }) {
  const pathname = usePathname();
  // Východiskovo rozbalené; preferencia sa načíta po pripojení, aby sa
  // server a klient pri prvom vykreslení zhodli.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const visible = ITEMS.filter((item) => !item.ownerOnly || role === 'owner');

  const isActive = (item: Item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <nav className={`side${collapsed ? ' collapsed' : ''}`} aria-label="Hlavná navigácia">
      <div className="side-items">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`side-item${active ? ' on' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span className="side-ico"><Icon /></span>
              <span className="side-label">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="side-foot">
        <Link href="/" className="side-item" title={collapsed ? 'Zákaznícky web' : undefined}>
          <span className="side-ico"><IconExternal /></span>
          <span className="side-label">Zákaznícky web</span>
        </Link>

        <button
          type="button"
          className="side-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Rozbaliť menu' : 'Zbaliť menu'}
        >
          <span className="side-ico"><IconChevronLeft /></span>
          <span className="side-label">Zbaliť menu</span>
        </button>
      </div>
    </nav>
  );
}
