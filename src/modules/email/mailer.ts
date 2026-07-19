/**
 * Odosielanie e-mailov cez HTTP API poskytovateľa.
 *
 * Zámerne bez knižnice – Resend aj Postmark sú jednoduché JSON endpointy,
 * takže stačí fetch. Žiadna ďalšia závislosť, ktorá by sa mohla rozbiť
 * pri deploji.
 *
 * Bez konfigurácie je mailer **inertný**: nič neposiela, len zaloguje a
 * ohlási 'skipped'. Vývoj ani produkcia tak nespadne na chýbajúcom kľúči
 * a e-maily sa dajú zapnúť neskôr len doplnením premenných.
 */

export type MailProvider = 'resend' | 'postmark' | 'none';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  status: 'sent' | 'skipped';
  providerId?: string;
}

export interface MailerConfig {
  provider: MailProvider;
  apiKey: string;
  from: string;
}

export class MailError extends Error {}

/** Rozpozná poskytovateľa z konfigurácie; bez kľúča alebo odosielateľa = vypnuté. */
export function resolveProvider(cfg: {
  provider?: string; apiKey?: string; from?: string;
}): MailProvider {
  if (!cfg.apiKey || !cfg.from) return 'none';
  if (cfg.provider === 'resend' || cfg.provider === 'postmark') return cfg.provider;
  return 'none';
}

export class Mailer {
  constructor(
    private readonly config: MailerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.config.provider !== 'none';
  }

  async send(message: MailMessage): Promise<MailResult> {
    if (!this.enabled) {
      console.log(`[email:vypnuté] ${message.subject} → ${message.to}`);
      return { status: 'skipped' };
    }

    const { url, body, headers } = this.config.provider === 'resend'
      ? this.resendRequest(message)
      : this.postmarkRequest(message);

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new MailError(`Odoslanie zlyhalo (${res.status}) ${detail.slice(0, 200)}`);
    }

    const payload = await res.json().catch(() => ({} as Record<string, unknown>));
    const providerId = String(
      (payload as any).id ?? (payload as any).MessageID ?? '',
    ) || undefined;

    return { status: 'sent', providerId };
  }

  private resendRequest(message: MailMessage) {
    return {
      url: 'https://api.resend.com/emails',
      headers: { authorization: `Bearer ${this.config.apiKey}` },
      body: {
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
    };
  }

  private postmarkRequest(message: MailMessage) {
    return {
      url: 'https://api.postmarkapp.com/email',
      headers: { 'X-Postmark-Server-Token': this.config.apiKey },
      body: {
        From: this.config.from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html,
        MessageStream: 'outbound',
      },
    };
  }
}
