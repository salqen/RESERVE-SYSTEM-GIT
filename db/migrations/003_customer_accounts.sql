-- =====================================================================
-- 003 – Zákaznícke účty
--
-- Zároveň opravuje podstatnú chybu: zákazník sa upsertoval podľa
-- `erp_customer_id`, ktorý je pri objednávke z webu NULL. V Postgrese
-- sa NULL hodnoty v unikátnom indexe nekonfliktujú, takže každá ďalšia
-- rezervácia toho istého človeka zakladala NOVÝ riadok v `customer`.
-- História účtu by tak bola prázdna a ERP by dostávalo duplicity.
-- =====================================================================

-- Zlúčenie duplicít vzniknutých pred opravou: rezervácie sa presunú na
-- najstarší záznam daného e-mailu, zvyšné sa zmažú.
WITH canonical AS (
  SELECT DISTINCT ON (lower(email)) id, lower(email) AS email_key
    FROM customer ORDER BY lower(email), created_at
),
duplicates AS (
  SELECT c.id AS dup_id, k.id AS keep_id
    FROM customer c
    JOIN canonical k ON k.email_key = lower(c.email)
   WHERE c.id <> k.id
)
UPDATE booking b SET customer_id = d.keep_id
  FROM duplicates d WHERE b.customer_id = d.dup_id;

DELETE FROM customer c
 USING (
   SELECT c2.id FROM customer c2
     JOIN (SELECT DISTINCT ON (lower(email)) id, lower(email) AS email_key
             FROM customer ORDER BY lower(email), created_at) k
       ON k.email_key = lower(c2.email)
    WHERE c2.id <> k.id
 ) dup
 WHERE c.id = dup.id;

CREATE UNIQUE INDEX idx_customer_email ON customer (lower(email));

-- Heslo je voliteľné: rezervovať sa dá aj bez účtu, účet si zákazník
-- môže založiť neskôr na ten istý e-mail a uvidí staršie rezervácie.
ALTER TABLE customer ADD COLUMN password_hash text;
ALTER TABLE customer ADD COLUMN last_login_at timestamptz;

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
