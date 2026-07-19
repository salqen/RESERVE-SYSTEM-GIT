import express from 'express';
import { config } from './config';
import { availabilityRouter } from './modules/availability/router';
import { bookingsRouter } from './modules/bookings/router';
import { adminRouter } from './modules/admin/router';
import { requireAdmin } from './modules/admin/auth';
import { adminAuthRouter } from './modules/admin/auth-router';
import { webhooksRouter } from './modules/webhooks/router';
import { catalogRouter } from './modules/catalog/router';
import { accountRouter } from './modules/customers/router';
import { startJobs } from './jobs/cleanup';

const app = express();
// verify hook odloží raw telo pre HMAC overenie webhookov
app.use(express.json({
  verify: (req, _res, buf) => { (req as any).rawBody = buf; },
}));

// CORS pre zákaznícky web (Fáza 4)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', config.webOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/catalog', catalogRouter);
app.use('/account', accountRouter);
app.use('/availability', availabilityRouter);
app.use('/bookings', bookingsRouter);
app.use('/admin/auth', adminAuthRouter);
app.use('/admin', requireAdmin, adminRouter);
app.use('/webhooks', webhooksRouter);

// Centrálny error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Interná chyba servera' });
});

app.listen(config.port, () => {
  console.log(`Rezervačný systém beží na porte ${config.port}`);
  startJobs();
});
