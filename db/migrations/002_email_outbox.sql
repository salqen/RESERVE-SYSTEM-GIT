-- =====================================================================
-- 002 – E-maily cez existujúci outbox
--
-- Pribúda tretí cieľ 'email'. Rovnaká mechanika ako pri ERP: event sa
-- zapíše v transakcii s rezerváciou, worker ho doručí s retry. Ak
-- poskytovateľ vypadne, rezervácia platí ďalej a e-mail sa pošle neskôr.
-- =====================================================================

ALTER TABLE sync_outbox DROP CONSTRAINT IF EXISTS sync_outbox_target_check;

ALTER TABLE sync_outbox
  ADD CONSTRAINT sync_outbox_target_check
  CHECK (target IN ('erp', 'service_manager', 'email'));

-- Záznam odoslaných e-mailov: podklad pre reklamácie („neprišlo mi nič")
-- a poistka proti dvojitému odoslaniu pri retry.
CREATE TABLE email_log (
  id           bigserial PRIMARY KEY,
  booking_id   uuid REFERENCES booking(id) ON DELETE SET NULL,
  recipient    text NOT NULL,
  template     text NOT NULL,
  subject      text NOT NULL,
  provider_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, template)
);

CREATE INDEX idx_email_log_recipient ON email_log (lower(recipient), created_at DESC);
