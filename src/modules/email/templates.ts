/**
 * Šablóny zákazníckych e-mailov.
 *
 * Čisté funkcie bez DB a bez siete – dajú sa testovať priamo a človek si
 * vie výsledok pozrieť bez toho, aby čokoľvek odoslal.
 */

export interface BookingEmailData {
  bookingId: string;
  customerName: string;
  totalPrice: number;
  rooms: { name: string; checkIn: string; checkOut: string; price: number }[];
  services: { name: string; startsAt: string; price: number }[];
  /** Odkaz na detail rezervácie na zákazníckom webe. */
  detailUrl?: string;
}

export interface CancellationEmailData extends BookingEmailData {
  refundTotal: number;
  feeTotal: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const eur = (value: number) =>
  `${value.toFixed(2).replace('.', ',')} €`;

const day = (iso: string) => {
  const d = iso.slice(0, 10);
  return `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;
};

const dayTime = (iso: string) => `${day(iso)} o ${iso.slice(11, 16)}`;

/** Escapovanie do HTML – mená a názvy idú od používateľa. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function itemLines(data: BookingEmailData): string[] {
  const lines: string[] = [];
  for (const r of data.rooms) {
    lines.push(`${r.name}: ${day(r.checkIn)} – ${day(r.checkOut)} · ${eur(r.price)}`);
  }
  for (const s of data.services) {
    lines.push(`${s.name}: ${dayTime(s.startsAt)} · ${eur(s.price)}`);
  }
  return lines;
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c2430;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e7ec;border-radius:12px;padding:24px">
${bodyHtml}
</div>
</body></html>`;
}

function itemsHtml(data: BookingEmailData): string {
  return itemLines(data)
    .map((line) => `<li style="margin-bottom:6px">${escapeHtml(line)}</li>`)
    .join('\n');
}

function detailLink(data: BookingEmailData): { text: string; html: string } {
  if (!data.detailUrl) return { text: '', html: '' };
  return {
    text: `\nDetail rezervácie: ${data.detailUrl}\n`,
    html: `<p style="margin:18px 0 0"><a href="${escapeHtml(data.detailUrl)}" style="color:#175cd3">Zobraziť rezerváciu</a></p>`,
  };
}

/** Potvrdenie rezervácie. */
export function renderConfirmation(data: BookingEmailData): RenderedEmail {
  const subject = 'Potvrdenie rezervácie';
  const link = detailLink(data);

  const text = [
    `Dobrý deň, ${data.customerName},`,
    '',
    'vašu rezerváciu sme potvrdili. Zhrnutie:',
    '',
    ...itemLines(data).map((l) => `- ${l}`),
    '',
    `Spolu: ${eur(data.totalPrice)}`,
    link.text,
    'Tešíme sa na vás.',
  ].join('\n');

  const html = wrapHtml(subject, `
<h1 style="font-size:20px;margin:0 0 12px">Rezervácia potvrdená</h1>
<p style="margin:0 0 14px">Dobrý deň, ${escapeHtml(data.customerName)}, vašu rezerváciu sme potvrdili.</p>
<ul style="padding-left:18px;margin:0 0 14px">
${itemsHtml(data)}
</ul>
<p style="margin:0;font-weight:600">Spolu: ${eur(data.totalPrice)}</p>
${link.html}`);

  return { subject, text, html };
}

/** Potvrdenie storna vrátane vyúčtovania. */
export function renderCancellation(data: CancellationEmailData): RenderedEmail {
  const subject = 'Zrušenie rezervácie';

  const refundLine = data.refundTotal > 0
    ? `Vrátime vám ${eur(data.refundTotal)}${data.feeTotal > 0 ? ` (storno poplatok ${eur(data.feeTotal)})` : ''}.`
    : data.feeTotal > 0
      ? `Podľa storno podmienok sa suma nevracia (storno poplatok ${eur(data.feeTotal)}).`
      : 'Rezervácia bola zrušená bez poplatku.';

  const text = [
    `Dobrý deň, ${data.customerName},`,
    '',
    'vašu rezerváciu sme zrušili. Zrušené položky:',
    '',
    ...itemLines(data).map((l) => `- ${l}`),
    '',
    refundLine,
  ].join('\n');

  const html = wrapHtml(subject, `
<h1 style="font-size:20px;margin:0 0 12px">Rezervácia zrušená</h1>
<p style="margin:0 0 14px">Dobrý deň, ${escapeHtml(data.customerName)}, vašu rezerváciu sme zrušili.</p>
<ul style="padding-left:18px;margin:0 0 14px">
${itemsHtml(data)}
</ul>
<p style="margin:0">${escapeHtml(refundLine)}</p>`);

  return { subject, text, html };
}
