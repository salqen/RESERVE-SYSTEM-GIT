export const dynamic = 'force-dynamic';
import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCalendar, getMe, UnauthorizedError, type CalendarRoom } from '@/lib/admin-api';
import { logoutAction } from './actions';

const DAY_MS = 86_400_000;

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(isoDate: string, n: number): string {
  return iso(new Date(Date.parse(isoDate) + n * DAY_MS));
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** Pondelok týždňa, do ktorého spadá dnešok. */
function startOfWeek(): string {
  const now = new Date();
  const shift = (now.getUTCDay() + 6) % 7; // 0 = pondelok
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - shift)));
}

const WEEKDAYS = ['po', 'ut', 'st', 'št', 'pi', 'so', 'ne'];

function dayLabel(isoDate: string): { name: string; num: number; weekend: boolean } {
  const d = new Date(isoDate);
  const idx = (d.getUTCDay() + 6) % 7;
  return { name: WEEKDAYS[idx], num: d.getUTCDate(), weekend: idx >= 5 };
}

/**
 * Rozloží rezervácie izby na bunky mriežky: buď pruh cez N nocí, alebo
 * voľnú bunku. Rezervácie presahujúce zobrazený rozsah sa orežú.
 */
function roomCells(room: CalendarRoom, from: string, to: string) {
  const total = daysBetween(from, to);
  const cells: { key: string; span: number; booking?: CalendarRoom['bookings'][number] }[] = [];

  const sorted = [...room.bookings].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  let cursor = 0;

  for (const booking of sorted) {
    const start = Math.max(0, daysBetween(from, booking.checkIn.slice(0, 10)));
    const end = Math.min(total, daysBetween(from, booking.checkOut.slice(0, 10)));
    if (end <= cursor || start >= total) continue;   // mimo rozsahu alebo prekryté

    const barStart = Math.max(start, cursor);
    for (let i = cursor; i < barStart; i++) cells.push({ key: `free-${room.room_id}-${i}`, span: 1 });
    cells.push({ key: `b-${booking.bookingId}`, span: Math.max(1, end - barStart), booking });
    cursor = end;
  }
  for (let i = cursor; i < total; i++) cells.push({ key: `free-${room.room_id}-${i}`, span: 1 });

  return cells;
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from ?? '') ? searchParams.from! : startOfWeek();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to ?? '') ? searchParams.to! : addDays(from, 7);

  let me, calendar;
  try {
    [me, calendar] = await Promise.all([getMe(), getCalendar(from, to)]);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    return (
      <div className="admin-main">
        <div className="admin-alert error">
          Nepodarilo sa načítať kalendár: {err instanceof Error ? err.message : 'neznáma chyba'}
        </div>
      </div>
    );
  }

  const total = daysBetween(from, to);
  const days = Array.from({ length: total }, (_, i) => addDays(from, i));
  const columns = `150px repeat(${total}, minmax(56px, 1fr))`;

  const occupiedNights = calendar.rooms.reduce(
    (sum, room) => sum + roomCells(room, from, to)
      .filter((c) => c.booking).reduce((n, c) => n + c.span, 0), 0);
  const occupancy = calendar.rooms.length
    ? Math.round((occupiedNights / (calendar.rooms.length * total)) * 100) : 0;

  return (
    <>
      <div className="admin-top">
        <div className="admin-brand">
          <div className="admin-mark">P</div>
          <div>
            <div className="admin-brand-name">Penzión <b>admin</b></div>
            <div className="admin-brand-sub">Kalendár obsadenosti</div>
          </div>
        </div>
        <div className="admin-spacer" />
        <div className="admin-who">
          <b>{me.user.name}</b>
          {me.user.email}
        </div>
        <form action={logoutAction}>
          <button className="admin-btn" type="submit">Odhlásiť</button>
        </form>
      </div>

      <div className="admin-body">
        <nav className="admin-rail" aria-label="Sekcie">
          <Link href="/admin" className="on" title="Kalendár" aria-label="Kalendár">▦</Link>
          <Link href="/" title="Zákaznícky web" aria-label="Zákaznícky web">↗</Link>
        </nav>

        <main className="admin-main">
          <div className="admin-head">
            <span className="admin-title">Obsadenosť</span>
            <Link className="admin-btn" href={`/admin?from=${addDays(from, -total)}&to=${from}`}>← Predošlé</Link>
            <span className="admin-range">{from} – {addDays(to, -1)}</span>
            <Link className="admin-btn" href={`/admin?from=${to}&to=${addDays(to, total)}`}>Ďalšie →</Link>
            <div className="admin-spacer" />
            <span className="admin-range">obsadenosť {occupancy} %</span>
          </div>

          {calendar.rooms.length === 0 && (
            <div className="admin-alert info">Zatiaľ nie sú založené žiadne izby.</div>
          )}

          {calendar.rooms.length > 0 && (
            <div className="cal-scroll">
              <div className="cal" style={{ gridTemplateColumns: columns }}>
                <div />
                {days.map((d) => {
                  const label = dayLabel(d);
                  return (
                    <div key={d} className={`cal-day${label.weekend ? ' weekend' : ''}`}>
                      {label.name} {label.num}
                    </div>
                  );
                })}

                {calendar.rooms.map((room) => (
                  <Fragment key={room.room_id}>
                    <div className="cal-name" title={room.room_name}>{room.room_name}</div>
                    {roomCells(room, from, to).map((cell) => (
                      cell.booking ? (
                        <div
                          key={cell.key}
                          className={`cal-bar ${cell.booking.status}`}
                          style={{ gridColumn: `span ${cell.span}` }}
                          title={`${cell.booking.customer ?? 'Bez mena'} · ${cell.booking.checkIn.slice(0, 10)} – ${cell.booking.checkOut.slice(0, 10)}`}
                        >
                          {cell.booking.status === 'hold' ? 'Hold · ' : ''}
                          {cell.booking.customer ?? 'Bez mena'}
                        </div>
                      ) : (
                        <div key={cell.key} className="cal-free" />
                      )
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          <div className="cal-legend">
            <span><i className="cal-swatch" style={{ background: 'var(--volt)' }} />potvrdené</span>
            <span><i className="cal-swatch" style={{ background: 'var(--card-hover)', border: '1px dashed var(--volt-2)' }} />dočasný hold</span>
            <span><i className="cal-swatch" style={{ background: 'var(--panel-2)' }} />voľné</span>
          </div>

          <section className="admin-section">
            <h2>Zdroje</h2>
            {calendar.resources.length === 0 && (
              <p className="admin-empty">Zatiaľ nie sú založené žiadne zdroje.</p>
            )}
            {calendar.resources.map((r) => (
              <div key={r.resource_id} style={{ marginBottom: 10 }}>
                <div className="cal-name" style={{ padding: '4px 0' }}>
                  {r.resource_name} <span style={{ color: 'var(--desc)' }}>({r.resource_type})</span>
                </div>
                {r.busy.length === 0 && r.timeoff.length === 0 && (
                  <p className="admin-empty" style={{ padding: '2px 0' }}>Žiadne obsadenie v tomto rozsahu.</p>
                )}
                {r.busy.map((b) => (
                  <div key={`${b.start}-${b.serviceId}`} className="cal-bar confirmed" style={{ marginBottom: 3 }}>
                    {b.start.slice(0, 16).replace('T', ' ')} – {b.end.slice(11, 16)}
                  </div>
                ))}
                {r.timeoff.map((t) => (
                  <div key={t.start} className="cal-bar timeoff" style={{ marginBottom: 3 }}>
                    Neprítomnosť {t.start.slice(0, 10)} – {t.end.slice(0, 10)}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </div>
                ))}
              </div>
            ))}
          </section>
        </main>
      </div>
    </>
  );
}
