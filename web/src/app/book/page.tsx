export const dynamic = 'force-dynamic';
import { getCatalog } from '@/lib/api';
import { eur, dateLabel, dateTimeLabel, nightsBetween } from '@/lib/format';
import { createHoldAction } from './actions';

type Params = {
  type?: 'room' | 'service';
  roomId?: string; from?: string; to?: string;
  serviceId?: string; resourceId?: string; startsAt?: string;
  error?: string;
};

/** Zhrnutie vybranej položky + kontaktný formulár → vytvorenie holdu. */
export default async function BookPage({ searchParams }: { searchParams: Params }) {
  const p = searchParams;
  const isRoom = p.type === 'room';
  const valid = isRoom
    ? Boolean(p.roomId && p.from && p.to)
    : Boolean(p.serviceId && p.resourceId && p.startsAt);
  if (!valid) {
    return <div className="alert error">Neúplný výber. Začnite prosím výberom termínu na úvodnej stránke.</div>;
  }

  let summary = '';
  let price: number | null = null;
  try {
    const catalog = await getCatalog();
    if (isRoom) {
      const room = catalog.rooms.find((r) => r.id === p.roomId);
      const nights = nightsBetween(p.from!, p.to!);
      summary = `${room?.name ?? 'Izba'} · ${dateLabel(p.from!)} – ${dateLabel(p.to!)}`;
      if (room) price = Number(room.price_night) * nights;
    } else {
      const svc = catalog.services.find((s) => s.id === p.serviceId);
      summary = `${svc?.name ?? 'Služba'} · ${dateTimeLabel(p.startsAt!)}`;
      if (svc) price = Number(svc.price);
    }
  } catch {
    return <div className="alert error">Server rezervácií je momentálne nedostupný.</div>;
  }

  return (
    <>
      <h1>Dokončenie rezervácie</h1>
      <div className="card">
        <strong>{summary}</strong>
        {price !== null && <><br /><small className="muted">Cena: {eur(price)}</small></>}
      </div>

      {p.error && <div className="alert error">{p.error}</div>}

      <form action={createHoldAction}>
        <input type="hidden" name="type" value={isRoom ? 'room' : 'service'} />
        {isRoom ? (
          <>
            <input type="hidden" name="roomId" value={p.roomId} />
            <input type="hidden" name="from" value={p.from} />
            <input type="hidden" name="to" value={p.to} />
          </>
        ) : (
          <>
            <input type="hidden" name="serviceId" value={p.serviceId} />
            <input type="hidden" name="resourceId" value={p.resourceId} />
            <input type="hidden" name="startsAt" value={p.startsAt} />
          </>
        )}
        <div className="card">
          <label className="field">Meno a priezvisko
            <input name="name" required minLength={2} autoComplete="name" />
          </label>
          <br />
          <label className="field">E-mail
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <br />
          <label className="field">Telefón (nepovinné)
            <input name="phone" type="tel" autoComplete="tel" />
          </label>
          <br />
          <label className="field">Poznámka (nepovinné)
            <input name="note" maxLength={500} />
          </label>
        </div>
        <button className="btn" type="submit">Pokračovať na platbu</button>
        <p><small className="muted">
          Odoslaním sa termín na 15 minút zamkne pre vás. Rezervácia platí až po zaplatení.
        </small></p>
      </form>
    </>
  );
}
