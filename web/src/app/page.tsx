export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getCatalog } from '@/lib/api';
import { eur, minutesLabel } from '@/lib/format';

/** YYYY-MM-DD pre <input type="date"> s posunom o N dní od dneška. */
function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default async function HomePage() {
  let catalog;
  try {
    catalog = await getCatalog();
  } catch {
    return <div className="alert error">Server rezervácií je momentálne nedostupný. Skúste to o chvíľu.</div>;
  }

  return (
    <>
      <h1 id="ubytovanie">Ubytovanie</h1>
      <p className="muted">Vyberte termín pobytu – zobrazíme voľné izby a ceny za pobyt.</p>
      <form className="inline" action="/rooms" method="get">
        <label className="field">Príchod
          <input type="date" name="from" required defaultValue={isoDate(1)} min={isoDate(0)} />
        </label>
        <label className="field">Odchod
          <input type="date" name="to" required defaultValue={isoDate(3)} min={isoDate(1)} />
        </label>
        <button className="btn" type="submit">Vyhľadať voľné izby</button>
      </form>

      <h2>Naše izby</h2>
      {catalog.rooms.length === 0 && <p className="muted">Momentálne neponúkame žiadne izby.</p>}
      {catalog.rooms.map((r) => (
        <div className="card row" key={r.id}>
          <div>
            <strong>{r.name}</strong>
            <br />
            <small className="muted">
              {r.room_type}, max {r.capacity} os. · od {eur(r.price_night)}/noc
              {r.min_nights > 1 && ` · min. ${r.min_nights} noci`}
            </small>
          </div>
          <Link className="btn secondary" href={`/rooms?from=${isoDate(1)}&to=${isoDate(3)}`}>
            Voľné termíny
          </Link>
        </div>
      ))}

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
