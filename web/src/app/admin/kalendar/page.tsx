export const dynamic = 'force-dynamic';
import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCalendar, getMe, UnauthorizedError, type CalendarRoom } from '@/lib/admin-api';
import AdminShell from '../shell';

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
  const shift = (now.getUTCDay() + 6) % 7;
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - shift)));
}

const WEEKDAYS = ['po', 'ut', 'st', 'št', 'pi', 'so', 'ne'];

function dayLabel(isoDate: string) {
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
    if (end <= cursor || start >= total) continue;

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
    throw err;
  }

  const total = daysBetween(from, to);
  const days = Array.from({ length: total }, (_, i) => addDays(from, i));
  const columns = `150px repeat(${total}, minmax(56px, 1fr))`;

  const occupiedNights = calendar.rooms.reduce(
    (sum, room) => sum + roomCells(room, from, to)
      .filter((c) => c.booking).reduce((n, c) => n + c.span, 0), 0);
  const occupancy = calendar.rooms.length
    ? Math.round((occupiedNights / (calendar.rooms.length * total)) * 100) : 0;

  const thisWeek = startOfWeek();

  return (
    <AdminShell
      user={me.user}
      title="Kalendár"
      subtitle={`${from} – ${addDays(to, -1)} · obsadenosť ${occupancy} %`}
      actions={
        <>
          <Link className="btn" href={`/admin/kalendar?from=${addDays(from, -total)}&to=${from}`}>
            ← Predošlé
          </Link>
          <Link className="btn" href={`/admin/kalendar?from=${thisWeek}&to=${addDays(thisWeek, 7)}`}>
            Tento týždeň
          </Link>
          <Link className="btn" href={`/admin/kalendar?from=${to}&to=${addDays(to, total)}`}>
            Ďalšie →
          </Link>
        </>
      }
    >
      {calendar.rooms.length === 0 && (
        <div className="alert info">
          Zatiaľ nie sú založené žiadne izby. Pridáte ich v sekcii Katalóg.
        </div>
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
                    <Link
                      key={cell.key}
                      href={`/admin/bookings/${cell.booking.bookingId}`}
                      className={`cal-bar ${cell.booking.status}`}
                      style={{ gridColumn: `span ${cell.span}` }}
                      title={`${cell.booking.customer ?? 'Bez mena'} · ${cell.booking.checkIn.slice(0, 10)} – ${cell.booking.checkOut.slice(0, 10)}`}
                    >
                      {cell.booking.status === 'hold' ? 'Hold · ' : ''}
                      {cell.booking.customer ?? 'Bez mena'}
                    </Link>
                  ) : (
                    <div key={cell.key} className="cal-free" />
                  )
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="legend">
        <span><i className="swatch" style={{ background: 'var(--volt)' }} />potvrdené</span>
        <span><i className="swatch" style={{ background: 'var(--card-hover)', border: '1px dashed var(--volt-2)' }} />dočasný hold</span>
        <span><i className="swatch" style={{ background: 'var(--panel-2)' }} />voľné</span>
      </div>

      <section className="section">
        <h2 className="section-title">Zdroje</h2>
        {calendar.resources.length === 0 && (
          <p className="empty">Zatiaľ nie sú založené žiadne zdroje.</p>
        )}
        {calendar.resources.map((r) => (
          <div key={r.resource_id} className="item">
            <div className="item-head">
              <strong>{r.resource_name}</strong>
              <span className="sub">({r.resource_type})</span>
            </div>
            {r.busy.length === 0 && r.timeoff.length === 0 && (
              <p className="empty" style={{ padding: '4px 0' }}>Žiadne obsadenie v tomto rozsahu.</p>
            )}
            {r.busy.map((b) => (
              <div key={`${b.start}-${b.serviceId}`} className="cal-bar confirmed" style={{ marginTop: 4 }}>
                {b.start.slice(0, 16).replace('T', ' ')} – {b.end.slice(11, 16)}
              </div>
            ))}
            {r.timeoff.map((t) => (
              <div key={t.start} className="cal-bar timeoff" style={{ marginTop: 4 }}>
                Neprítomnosť {t.start.slice(0, 10)} – {t.end.slice(0, 10)}
                {t.reason ? ` · ${t.reason}` : ''}
              </div>
            ))}
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
