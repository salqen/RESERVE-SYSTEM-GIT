-- =====================================================================
-- Demo dáta pre rezervačný systém (idempotentné – dá sa spustiť opakovane)
-- Spustenie: psql "$DATABASE_URL" -f db/seed-demo.sql
--            alebo cez Railway → Postgres → Data → Query
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Storno politiky
-- ---------------------------------------------------------------------

INSERT INTO cancellation_policy (id, name, description)
SELECT '11111111-1111-1111-1111-111111111111', 'Štandard – ubytovanie',
       'Zrušenie 7+ dní vopred 100 %, 2–7 dní 50 %, menej ako 48 h bez vrátenia.'
WHERE NOT EXISTS (SELECT 1 FROM cancellation_policy WHERE id = '11111111-1111-1111-1111-111111111111');

INSERT INTO cancellation_policy (id, name, description)
SELECT '22222222-2222-2222-2222-222222222222', 'Štandard – služby',
       'Zrušenie 24+ h vopred 100 %, 4–24 h 50 %, menej ako 4 h bez vrátenia.'
WHERE NOT EXISTS (SELECT 1 FROM cancellation_policy WHERE id = '22222222-2222-2222-2222-222222222222');

INSERT INTO cancellation_tier (policy_id, hours_before, refund_pct) VALUES
  ('11111111-1111-1111-1111-111111111111', 168, 100),
  ('11111111-1111-1111-1111-111111111111',  48,  50),
  ('22222222-2222-2222-2222-222222222222',  24, 100),
  ('22222222-2222-2222-2222-222222222222',   4,  50)
ON CONFLICT (policy_id, hours_before) DO NOTHING;

-- ---------------------------------------------------------------------
-- Prevádzka
-- ---------------------------------------------------------------------

INSERT INTO property (id, name)
SELECT '33333333-3333-3333-3333-333333333333', 'Penzión Lipa'
WHERE NOT EXISTS (SELECT 1 FROM property WHERE id = '33333333-3333-3333-3333-333333333333');

-- ---------------------------------------------------------------------
-- Izby
-- ---------------------------------------------------------------------

INSERT INTO room (id, property_id, name, room_type, capacity, price_night, min_nights, cancellation_policy_id, active)
SELECT * FROM (VALUES
  ('44444444-0000-0000-0000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Izba 101 – Dvojlôžková', 'dvojlozkova', 2,  75.00::numeric, 1, '11111111-1111-1111-1111-111111111111'::uuid, true),
  ('44444444-0000-0000-0000-000000000002'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Izba 102 – Dvojlôžková', 'dvojlozkova', 2,  75.00::numeric, 1, '11111111-1111-1111-1111-111111111111'::uuid, true),
  ('44444444-0000-0000-0000-000000000003'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Izba 201 – Trojlôžková', 'trojlozkova', 3,  95.00::numeric, 1, '11111111-1111-1111-1111-111111111111'::uuid, true),
  ('44444444-0000-0000-0000-000000000004'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Apartmán Lipa',          'apartman',    4, 140.00::numeric, 2, '11111111-1111-1111-1111-111111111111'::uuid, true)
) AS v(id, property_id, name, room_type, capacity, price_night, min_nights, cancellation_policy_id, active)
WHERE NOT EXISTS (SELECT 1 FROM room r WHERE r.id = v.id);

-- Letná sezóna – vyššie ceny
INSERT INTO room_price_rule (room_id, season, price_night)
SELECT v.room_id, v.season, v.price_night FROM (VALUES
  ('44444444-0000-0000-0000-000000000001'::uuid, daterange('2026-07-01','2026-09-01'),  95.00::numeric),
  ('44444444-0000-0000-0000-000000000002'::uuid, daterange('2026-07-01','2026-09-01'),  95.00::numeric),
  ('44444444-0000-0000-0000-000000000003'::uuid, daterange('2026-07-01','2026-09-01'), 120.00::numeric),
  ('44444444-0000-0000-0000-000000000004'::uuid, daterange('2026-07-01','2026-09-01'), 175.00::numeric)
) AS v(room_id, season, price_night)
WHERE NOT EXISTS (
  SELECT 1 FROM room_price_rule p WHERE p.room_id = v.room_id AND p.season && v.season
);

-- ---------------------------------------------------------------------
-- Zdroje (personál / miestnosti pre služby)
-- ---------------------------------------------------------------------

INSERT INTO resource (id, property_id, name, resource_type, active)
SELECT * FROM (VALUES
  ('55555555-0000-0000-0000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Jana – masérka',    'staff'::text,     true),
  ('55555555-0000-0000-0000-000000000002'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Peter – masér',     'staff'::text,     true),
  ('55555555-0000-0000-0000-000000000003'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Wellness miestnosť','room'::text,      true)
) AS v(id, property_id, name, resource_type, active)
WHERE NOT EXISTS (SELECT 1 FROM resource r WHERE r.id = v.id);

-- Pracovný čas: pondelok–sobota 9:00–18:00 (0 = nedeľa)
INSERT INTO resource_hours (resource_id, weekday, open_time, close_time)
SELECT r.id, d.weekday, '09:00'::time, '18:00'::time
FROM resource r
CROSS JOIN (SELECT generate_series(1,6) AS weekday) d
WHERE r.id IN (
  '55555555-0000-0000-0000-000000000001',
  '55555555-0000-0000-0000-000000000002',
  '55555555-0000-0000-0000-000000000003'
)
AND NOT EXISTS (
  SELECT 1 FROM resource_hours h WHERE h.resource_id = r.id AND h.weekday = d.weekday
);

-- ---------------------------------------------------------------------
-- Služby
-- ---------------------------------------------------------------------

INSERT INTO service (id, property_id, name, duration_min, buffer_min, price, cancellation_policy_id, active)
SELECT * FROM (VALUES
  ('66666666-0000-0000-0000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Klasická masáž 60 min',  60, 15, 45.00::numeric, '22222222-2222-2222-2222-222222222222'::uuid, true),
  ('66666666-0000-0000-0000-000000000002'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Športová masáž 90 min',  90, 15, 65.00::numeric, '22222222-2222-2222-2222-222222222222'::uuid, true),
  ('66666666-0000-0000-0000-000000000003'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Privátna sauna 90 min',  90, 30, 55.00::numeric, '22222222-2222-2222-2222-222222222222'::uuid, true)
) AS v(id, property_id, name, duration_min, buffer_min, price, cancellation_policy_id, active)
WHERE NOT EXISTS (SELECT 1 FROM service s WHERE s.id = v.id);

-- Kto/čo vie službu poskytnúť
INSERT INTO service_resource (service_id, resource_id) VALUES
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001'),
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002'),
  ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002'),
  ('66666666-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000003')
ON CONFLICT (service_id, resource_id) DO NOTHING;

COMMIT;
