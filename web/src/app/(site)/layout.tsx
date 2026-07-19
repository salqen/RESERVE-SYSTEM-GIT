export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getCurrentCustomer } from '@/lib/account-api';

/** Layout zákazníckeho webu – hlavička a obsahový stĺpec. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();

  return (
    <>
      <header className="site">
        <div className="inner">
          <Link href="/" className="brand">Penzión</Link>
          <nav>
            <Link href="/#ubytovanie">Ubytovanie</Link>
            <Link href="/#sluzby">Služby</Link>
          </nav>
          <span className="spacer" />
          <nav>
            <Link href="/ucet">
              {customer ? customer.name.split(' ')[0] : 'Môj účet'}
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
