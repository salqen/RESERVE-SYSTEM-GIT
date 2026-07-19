-- =====================================================================
-- 001 – Admin účty a sessions
--
-- Nahrádza zdieľaný ADMIN_TOKEN plnohodnotnými účtami:
--  - heslá sa ukladajú ako scrypt hash (nikdy v čitateľnej podobe)
--  - session token sa v DB drží len ako SHA-256 hash, originál vidí
--    iba prehliadač v httpOnly cookie (únik DB = žiadne použiteľné tokeny)
-- =====================================================================

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

-- E-mail case-insensitive bez závislosti na rozšírení citext
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

-- Neúspešné pokusy o prihlásenie – podklad pre rate limit a audit
CREATE TABLE admin_login_attempt (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  ip          text,
  success     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_login_attempt_recent ON admin_login_attempt (lower(email), created_at DESC);
