export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getServiceSlots } from '@/lib/api';
import { timeLabel, dateLabel } from '@/lib/format';

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { date?: string };
}) {
  const date = searchParams.date;

  let slots = null;
  let error: string | null = null;
  if (date) {
    try {
      slots = await getServiceSlots(params.id, date);
    } catch (e: any) {
      error = e?.status === 404 ? 'Služba neexistuje.' : 'Nepodarilo sa načítať voľné termíny.';
    }
  }

  return (
    <>
      <h1>{slots?.service ?? 'Rezervácia služby'}</h1>
      <form className="inline" method="get">
        <label className="field">Deň
          <input type="date" name="date" defaultValue={date} required />
        </label>
        <button className="btn" type="submit">Zobraziť voľné termíny</button>
      </form>

      {error && <div className="alert error">{error}</div>}

      {slots && (
        <>
          <p className="muted">{dateLabel(slots.date)} · dĺžka {slots.slotMinutes} min (vrátane prípravy)</p>
          {slots.resources.every((r) => r.freeSlots.length === 0) && (
            <div className="alert info">V tento deň nie je voľný žiadny termín. Skúste iný deň.</div>
          )}
          {slots.resources.map((r) =>
            r.freeSlots.length === 0 ? null : (
              <div className="card" key={r.resourceId}>
                <strong>{r.resourceName}</strong>
                <ul className="slots">
                  {r.freeSlots.map((s) => (
                    <li key={s}>
                      <Link
                        href={`/book?type=service&serviceId=${params.id}&resourceId=${r.resourceId}&startsAt=${encodeURIComponent(s)}`}
                      >
                        {timeLabel(s)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </>
      )}
    </>
  );
}
