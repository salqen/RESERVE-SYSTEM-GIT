/**
 * Čistá logika výpočtu voľných slotov pre služby.
 * Bez závislosti na DB – plne pokryté unit testami (tests/slots.test.ts).
 */

export interface TimeRange {
  start: Date; // vrátane
  end: Date;   // okrem
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Vypočíta voľné začiatky slotov v rámci pracovného okna zdroja.
 *
 * @param window     pracovné okno zdroja v daný deň (z resource_hours)
 * @param busy       obsadené intervaly (existujúce rezervácie vrátane bufferov + timeoff)
 * @param slotMin    dĺžka služby + buffer (minúty) – toľko musí byť súvisle voľné
 * @param stepMin    krok ponúkaných začiatkov (default 15 min)
 * @returns          zoznam voľných začiatkov (Date)
 */
export function computeFreeSlots(
  window: TimeRange,
  busy: TimeRange[],
  slotMin: number,
  stepMin = 15,
): Date[] {
  const free: Date[] = [];
  const slotMs = slotMin * 60_000;
  const stepMs = stepMin * 60_000;

  for (let t = window.start.getTime(); t + slotMs <= window.end.getTime(); t += stepMs) {
    const candidate: TimeRange = { start: new Date(t), end: new Date(t + slotMs) };
    if (!busy.some((b) => overlaps(candidate, b))) {
      free.push(candidate.start);
    }
  }
  return free;
}
