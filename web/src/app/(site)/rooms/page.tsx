export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getFreeRooms } from '@/lib/api';
import { eur, dateLabel, nightsBetween } from '@/lib/format';

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const { from, to } = searchParams;
  if (!from || !to || from >= to) {
    return (
      <>
        <h1>Voľné izby</h1>
        <div className="alert error">Zadajte platný termín – príchod musí byť pred odchodom.</div>
        <Link className="btn secondary" href="/">Späť na výber termínu</Link>
      </>
    );
  }

  let result;
  try {
    result = await getFreeRooms(from, to);
  } catch {
    return <div className="alert error">Nepodarilo sa načítať dostupnosť. Skúste to o chvíľu.</div>;
  }

  const nights = nightsBetween(from, to);

  return (
    <>
      <h1>Voľné izby</h1>
      <p className="muted">
        {dateLabel(from)} – {dateLabel(to)} · {nights} {nights === 1 ? 'noc' : nights < 5 ? 'noci' : 'nocí'}
      </p>
      {result.rooms.length === 0 && (
        <div className="alert info">V tomto termíne nie je voľná žiadna izba. Skúste iný termín.</div>
      )}
      {result.rooms.map((r) => (
        <div className="card row" key={r.id}>
          <div>
            <strong>{r.name}</strong> <span className="muted">({r.room_type}, max {r.capacity} os.)</span>
            <br />
            <small className="muted">
              {eur(r.price_night)}/noc · spolu {eur(Number(r.price_night) * nights)}
              {r.min_nights > 1 ? ` · min. ${r.min_nights} nocí` : ''}
            </small>
          </div>
          <Link
            className="btn"
            href={`/book?type=room&roomId=${r.id}&from=${from}&to=${to}`}
          >
            Rezervovať
          </Link>
        </div>
      ))}
    </>
  );
}
