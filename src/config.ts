export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/rezervacie',
  holdTtlMinutes: parseInt(process.env.HOLD_TTL_MINUTES ?? '15', 10),
  // Fáza 3 – keepi ERP
  keepiApiUrl: process.env.KEEPI_API_URL ?? '',        // prázdne = adaptér vypnutý (outbox čaká)
  keepiApiKey: process.env.KEEPI_API_KEY ?? '',
  keepiWebhookSecret: process.env.KEEPI_WEBHOOK_SECRET ?? '',
  // Fáza 3 – service manager
  serviceManagerWebhookSecret: process.env.SERVICE_MANAGER_WEBHOOK_SECRET ?? '',
  // Fáza 4 – zákaznícky web (CORS, odkazy v e-mailoch)
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  // Fáza 4 – e-maily. Bez EMAIL_API_KEY a EMAIL_FROM je odosielanie vypnuté
  // (eventy sa spracujú, len sa nič neodošle) – bezpečný default.
  emailProvider: process.env.EMAIL_PROVIDER ?? 'resend',   // resend | postmark
  emailApiKey: process.env.EMAIL_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
};
