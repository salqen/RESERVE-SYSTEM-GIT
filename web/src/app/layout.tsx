import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rezervácie – ubytovanie a služby',
  description: 'Online rezervácia izieb a služieb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk">
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">Penzión</Link>
            <nav>
              <Link href="/#ubytovanie">Ubytovanie</Link>
              <Link href="/#sluzby">Služby</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
