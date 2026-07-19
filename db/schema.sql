-- =====================================================================
-- Rezervačný systém – PostgreSQL schéma
-- Jadro ochrany proti double-bookingu: EXCLUSION CONSTRAINTS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Storno politiky (depozit + vrátenie podľa času do začiatku)
-- ---------------------------------------------------------------------

CREATE TABLE cancellation_policy (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text
);

-- Pásma vrátenia: čím bližšie k začiatku, tým nižšie percento.
-- refund_pct platí, ak sa ruší >= hours_before hodín pred začiatkom položky.
-- Najvyššie splnené hours_before vyhráva; ak sa nič nesplní, vráti sa 0 %.
CREATE TABLE cancellation_tier (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id     uuid NOT NULL REFERENCES cancellation_policy(id) ON DELETE CASCADE,
  hours_before  int  NOT NULL CHECK (hours_before >= 0),
  refund_pct    int  NOT NULL CHECK (refund_pct BETWEEN 0 AND 100),
  UNIQUE (policy_id, hours_before)
);

-- ---------------------------------------------------------------------
-- Katalóg
-- ---------------------------------------------------------------------

CREATE TABLE property (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES property(id),
  name          text NOT NULL,
  room_type     text NOT NULL,                -- napr. 'dvojlozkova', 'apartman'
  capacity      int  NOT NULL DEFAULT 2,
  price_night   numeric(10,2) NOT NULL,
  min_nights    int  NOT NULL DEFAULT 1,
  cancellation_policy_id uuid REFERENCES cancellation_policy(id),  -- NULL = plné vrátenie
  active        boolean NOT NULL DEFAULT true
);

-- Zdroj = personál / miestnosť / zariadenie potrebné pre službu
CREATE TABLE resource (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES property(id),
  name          text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('staff','room','equipment')),
  active        boolean NOT NULL DEFAULT true
);

-- Pracovné hodiny zdroja (týždenný rozvrh)
CREATE TABLE resource_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  weekday      int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = nedeľa
  open_time    time NOT NULL,
  close_time   time NOT NULL,
  CHECK (open_time < close_time)
);

-- Výnimky dostupnosti zdroja (dovolenka, PN) – hlási service manager
CREATE TABLE resource_timeoff (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  period       tstzrange NOT NULL,
  reason       text
);

CREATE TABLE service (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES property(id),
  name          text NOT NULL,
  duration_min  int  NOT NULL,        -- čistá dĺžka služby
  buffer_min    int  NOT NULL DEFAULT 0,  -- upratovanie/príprava po službe
  price         numeric(10,2) NOT NULL,
  cancellation_policy_id uuid REFERENCES cancellation_policy(id),  -- NULL = plné vrátenie
  active        boolean NOT NULL DEFAULT true
);

-- Ktoré zdroje vedia poskytnúť danú službu
CREATE TABLE service_resource (
  service_id   uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, resource_id)
);

-- Sezónne ceny izieb (voliteľné pravidlá; ak sa neprekrýva, platí room.price_night)
CREATE TABLE room_price_rule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  season      daterange NOT NULL,
  price_night numeric(10,2) NOT NULL,
  EXCLUDE USING gist (room_id WITH =, season WITH &&)  -- sezóny sa nesmú prekrývať
);

-- ---------------------------------------------------------------------
-- Zákazník (master dát = ERP, tu len referencia + kontakt)
-- ---------------------------------------------------------------------

CREATE TABLE customer (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_customer_id  text UNIQUE,      -- ID v keepi ERP (zdroj pravdy)
  name             text NOT NULL,
  email            text NOT NULL,
  phone            text,
  password_hash    text,             -- NULL = rezervoval bez účtu
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- E-mail je identita zákazníka na webe (viď db/migrations/003)
CREATE UNIQUE INDEX idx_customer_email ON customer (lower(email));

CREATE TABLE customer_session (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_session_customer ON customer_session (customer_id);
CREATE INDEX idx_customer_session_expiry ON customer_session (expires_at);

-- ---------------------------------------------------------------------
-- Rezervácie
-- Stavy: hold (dočasný zámok počas platby) → confirmed → cancelled
-- Expirovaný hold ruší cleanup job (src/jobs/cleanup.ts).
-- ---------------------------------------------------------------------

CREATE TABLE booking (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES customer(id),
  status           text NOT NULL CHECK (status IN ('hold','confirmed','cancelled')),
  hold_expires_at  timestamptz,      -- len pre status='hold'
  idempotency_key  text UNIQUE,      -- ochrana proti duplicitnému requestu
  total_price      numeric(10,2) NOT NULL DEFAULT 0,
  -- Fáza 3: väzba na keepi ERP (podklad faktúry + stav platby cez webhook)
  erp_invoice_id   text UNIQUE,
  payment_status   text NOT NULL DEFAULT 'unpaid'
                   CHECK (payment_status IN ('unpaid','paid','refunded')),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Položka: ubytovanie
-- status je denormalizovaný z booking (udržiava trigger) kvôli partial
-- exclusion constraintu – zrušené rezervácie neblokujú termín.
CREATE TABLE booking_room (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  room_id     uuid NOT NULL REFERENCES room(id),
  stay        daterange NOT NULL,   -- [check_in, check_out)
  price       numeric(10,2) NOT NULL,
  cancellation_policy_id uuid REFERENCES cancellation_policy(id),  -- snapshot z room v čase rezervácie
  status      text NOT NULL DEFAULT 'hold',
  -- JADRO: dve aktívne rezervácie tej istej izby sa nesmú prekrývať
  EXCLUDE USING gist (room_id WITH =, stay WITH &&)
    WHERE (status IN ('hold','confirmed'))
);

-- Položka: služba (time_slot už OBSAHUJE buffer_min)
CREATE TABLE booking_service (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  service_id   uuid NOT NULL REFERENCES service(id),
  resource_id  uuid NOT NULL REFERENCES resource(id),
  time_slot    tstzrange NOT NULL,
  price        numeric(10,2) NOT NULL,
  cancellation_policy_id uuid REFERENCES cancellation_policy(id),  -- snapshot zo service v čase rezervácie
  status       text NOT NULL DEFAULT 'hold',
  -- JADRO: jeden zdroj nemôže mať dva aktívne prekrývajúce sa sloty
  EXCLUDE USING gist (resource_id WITH =, time_slot WITH &&)
    WHERE (status IN ('hold','confirmed'))
);

-- Trigger: zmena stavu booking sa propaguje do položiek
CREATE OR REPLACE FUNCTION propagate_booking_status() RETURNS trigger AS $$
BEGIN
  UPDATE booking_room    SET status = NEW.status WHERE booking_id = NEW.id;
  UPDATE booking_service SET status = NEW.status WHERE booking_id = NEW.id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_status
  BEFORE UPDATE OF status ON booking
  FOR EACH ROW EXECUTE FUNCTION propagate_booking_status();

-- ---------------------------------------------------------------------
-- Audit log – kto, kedy, čo zmenil (reklamácie)
-- ---------------------------------------------------------------------

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  booking_id  uuid,
  actor       text NOT NULL,        -- 'web', 'admin:meno', 'system'
  action      text NOT NULL,        -- 'create_hold','confirm','cancel','expire',...
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Outbox – asynchrónna synchronizácia do ERP / service managera
-- (náhrada message queue v prvej verzii; retry rieši worker)
-- ---------------------------------------------------------------------

CREATE TABLE sync_outbox (
  id           bigserial PRIMARY KEY,
  target       text NOT NULL CHECK (target IN ('erp','service_manager','email')),
  event_type   text NOT NULL,       -- 'booking.confirmed','booking.cancelled',...
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts     int NOT NULL DEFAULT 0,
  next_retry   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending ON sync_outbox (next_retry) WHERE status = 'pending';
CREATE INDEX idx_booking_hold ON booking (hold_expires_at) WHERE status = 'hold';
CREATE INDEX idx_booking_room_room ON booking_room (room_id);
CREATE INDEX idx_booking_service_resource ON booking_service (resource_id);

-- ---------------------------------------------------------------------
-- Admin účty a sessions (viď db/migrations/001_admin_users.sql)
-- Heslá: scrypt hash. Session token: v DB len SHA-256 hash.
-- ---------------------------------------------------------------------

CREATE TABLE admin_user (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  name           text NOT NULL,
  password_hash  text NOT NULL,
  role           text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE UNIQUE INDEX idx_admin_user_email ON admin_user (lower(email));

CREATE TABLE admin_session (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);

CREATE INDEX idx_admin_session_user ON admin_session (user_id);
CREATE INDEX idx_admin_session_expiry ON admin_session (expires_at);

CREATE TABLE admin_login_attempt (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  ip          text,
  success     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_login_attempt_recent ON admin_login_attempt (lower(email), created_at DESC);

-- ---------------------------------------------------------------------
-- Odoslané e-maily (viď db/migrations/002_email_outbox.sql)
-- ---------------------------------------------------------------------

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
