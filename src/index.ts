import express from 'express';
import { config } from './config';
import { availabilityRouter } from './modules/availability/router';
import { bookingsRouter } from './modules/bookings/router';
import { adminRouter } from './modules/admin/router';
import { webhooksRouter } from './modules/webhooks/router';
import { startJobs } from './jobs/cleanup';

const app = express();
// verify hook odloží raw telo pre HMAC overenie webhookov
app.use(express.json({
  verify: (req, _res, buf) => { (req as any).rawBody = buf; },
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/availability', availabilityRouter);
app.use('/bookings', bookingsRouter);
app.use('/admin', adminRouter);
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
