export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getCatalog, getFreeRooms } from '@/lib/api';
import { eur, minutesLabel, dateLabel, nightsBetween } from '@/lib/format';

/** YYYY-MM-DD pre <input type="date"> s posunom o N dní od dneška. */
function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function nightsLabel(n: number): string {
  return n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí';
}

export default async function HomePage() {
  const from = isoDate(1);
  const to = isoDate(3);
  const nights = nightsBetween(from, to);

  let catalog;
  try {
    catalog = await getCatalog();
  } catch {
    return <div className="alert error">Server rezervácií je momentálne nedostupný. Skúste to o chvíľu.</div>;
  }

  // Predvolená ponuka: voľné izby v najbližšom termíne. Ak zlyhá, stránka
  // stále zobrazí katalóg izieb bez dostupnosti.
  let freeRooms: Awaited<ReturnType<typeof getFreeRooms>>['rooms'] | null = null;
  try {
    freeRooms = (await getFreeRooms(from, to)).rooms;
  } catch {
    freeRooms = null;
  }

  return (
    <>
      <h1 id="ubytovanie">Ubytovanie</h1>
      <p className="muted">Vyberte termín pobytu – zobrazíme voľné izby a ceny za pobyt.</p>
      <form className="inline" action="/rooms" method="get">
        <label className="field">Príchod
          <input type="date" name="from" required defaultValue={from} min={isoDate(0)} />
        </label>
        <label className="field">Odchod
          <input type="date" name="to" required defaultValue={to} min={from} />
        </label>
        <button className="btn" type="submit">Vyhľadať voľné izby</button>
      </form>

      <h2>Voľné termíny</h2>
      <p className="muted">
        {dateLabel(from)} – {dateLabel(to)} · {nights} {nightsLabel(nights)}
        {' · '}
        <Link href={`/rooms?from=${from}&to=${to}`}>zobraziť detail</Link>
      </p>

      {freeRooms === null && (
        // Dostupnosť sa nenačítala – aspoň katalóg izieb.
        <>
          <div className="alert info">Dostupnosť sa nepodarilo načítať. Nižšie je ponuka izieb.</div>
          {catalog.rooms.map((r) => (
            <div className="card row" key={r.id}>
              <div>
                <strong>{r.name}</strong>{' '}
                <span className="muted">({r.room_type}, max {r.capacity} os.)</span>
                <br />
                <small className="muted">od {eur(r.price_night)}/noc</small>
              </div>
            </div>
          ))}
        </>
      )}

      {freeRooms !== null && freeRooms.length === 0 && (
        <div className="alert info">V tomto termíne nie je voľná žiadna izba. Skúste iný termín vyššie.</div>
      )}

      {freeRooms !== null && freeRooms.map((r) => (
        <div className="card row" key={r.id}>
          <div>
            <strong>{r.name}</strong>{' '}
            <span className="muted">({r.room_type}, max {r.capacity} os.)</span>
            <br />
            <small className="muted">
              {eur(r.price_night)}/noc · spolu {eur(Number(r.price_night) * nights)}
              {r.min_nights > 1 ? ` · min. ${r.min_nights} ${nightsLabel(r.min_nights)}` : ''}
            </small>
          </div>
          <Link className="btn" href={`/book?type=room&roomId=${r.id}&from=${from}&to=${to}`}>
            Rezervovať
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
