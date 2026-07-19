import type { Metadata } from 'next';
import './admin.css';

export const metadata: Metadata = {
  title: 'Admin – rezervačný systém',
  robots: { index: false, follow: false },
};

/** Admin má vlastný tmavý vzhľad, nezdieľa hlavičku zákazníckeho webu. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>;
}
