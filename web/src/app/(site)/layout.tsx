import Link from 'next/link';

/** Layout zákazníckeho webu – hlavička a obsahový stĺpec. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
