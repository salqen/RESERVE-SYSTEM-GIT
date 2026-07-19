import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rezervácie – ubytovanie a služby',
  description: 'Online rezervácia izieb a služieb',
};

/**
 * Koreňový layout drží len <html>/<body>. Vzhľad si určuje každá sekcia:
 * (site) = zákaznícky web (svetlý), admin = správcovské rozhranie (tmavé).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk">
      <body>{children}</body>
    </html>
  );
}
