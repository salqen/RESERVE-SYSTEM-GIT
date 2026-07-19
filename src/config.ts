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
  // Fáza 4 – zákaznícky web (CORS)
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  // Admin API – zdieľaný token. Prázdne = admin API zavreté (fail-closed).
  adminToken: process.env.ADMIN_TOKEN ?? '',
};
