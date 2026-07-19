export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getCatalog } from '@/lib/api';
import { eur, minutesLabel } from '@/lib/format';

export default async function HomePage() {
  let catalog;
  try {
    catalog = await getCatalog();
  } catch {
    return <div className="alert error">Server rezervácií je momentálne nedostupný. Skúste to o chvíľu.</div>;
  }

  return (
    <>
      <h1>Ubytovanie</h1>
      <p className="muted">Vyberte termín pobytu – zobrazíme voľné izby.</p>
      <form className="inline" action="/rooms" method="get">
        <label className="field">Príchod
          <input type="date" name="from" required />
        </label>
        <label className="field">Odchod
          <input type="date" name="to" required />
        </label>
        <button className="btn" type="submit">Vyhľadať voľné izby</button>
      </form>

      <h2 id="sluzby">Služby</h2>
      {catalog.services.length === 0 && <p className="muted">Momentálne neponúkame žiadne služby.</p>}
      {catalog.services.map((s) => (
        <div className="card row" key={s.id}>
          <div>
            <strong>{s.name}</strong>
            <br />
            <small className="muted">{minutesLabel(s.duration_min)} · {eur(s.price)}</small>
          </div>
          <Link className="btn secondary" href={`/services/${s.id}`}>Vybrať termín</Link>
        </div>
      ))}
    </>
  );
}
