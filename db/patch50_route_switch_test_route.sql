BEGIN;

-- ============================================================
-- PROFIN OS
-- PATCH 50
-- Branch switch + isolated TEST annual route
-- ============================================================

ALTER TABLE year_registry
  ADD COLUMN IF NOT EXISTS route_mode TEXT
  NOT NULL DEFAULT 'PRODUCTION';

ALTER TABLE year_registry
  ADD COLUMN IF NOT EXISTS apps_script_web_app_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'year_registry_route_mode_chk'
  ) THEN
    ALTER TABLE year_registry
      ADD CONSTRAINT year_registry_route_mode_chk
      CHECK (route_mode IN ('PRODUCTION', 'TEST'));
  END IF;
END
$$;

UPDATE year_registry
SET route_mode = 'PRODUCTION'
WHERE route_mode IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM year_registry
    WHERE
      spreadsheet_id =
        '1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8'
      AND financial_year = 2026
  ) THEN
    RAISE EXCEPTION
      'PATCH 50 aborted: production Alternatyva route not found';
  END IF;
END
$$;

WITH source_route AS (
  SELECT
    yr.project_id,
    yr.location_id,
    yr.financial_year,
    yr.schema_version,
    yr.template_version
  FROM year_registry yr
  WHERE
    yr.spreadsheet_id =
      '1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8'
    AND yr.financial_year = 2026
  ORDER BY yr.updated_at DESC
  LIMIT 1
)
INSERT INTO locations (
  project_id,
  location_id,
  name,
  status
)
SELECT
  source_route.project_id,
  'alternatyva-test',
  'Альтернатива — TEST',
  'ACTIVE'
FROM source_route
ON CONFLICT (project_id, location_id)
DO UPDATE SET
  name = EXCLUDED.name,
  status = 'ACTIVE',
  updated_at = NOW();

WITH source_route AS (
  SELECT
    yr.project_id,
    yr.financial_year,
    yr.schema_version,
    yr.template_version
  FROM year_registry yr
  WHERE
    yr.spreadsheet_id =
      '1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8'
    AND yr.financial_year = 2026
  ORDER BY yr.updated_at DESC
  LIMIT 1
)
INSERT INTO year_registry (
  project_id,
  location_id,
  financial_year,
  spreadsheet_id,
  schema_version,
  template_version,
  status,
  route_mode,
  apps_script_web_app_url
)
SELECT
  source_route.project_id,
  'alternatyva-test',
  source_route.financial_year,
  '1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY',
  source_route.schema_version,
  source_route.template_version,
  'READY',
  'TEST',
  NULL
FROM source_route
ON CONFLICT (
  project_id,
  location_id,
  financial_year
)
DO UPDATE SET
  spreadsheet_id = EXCLUDED.spreadsheet_id,
  schema_version = EXCLUDED.schema_version,
  template_version = EXCLUDED.template_version,
  status = 'READY',
  route_mode = 'TEST',
  apps_script_web_app_url =
    year_registry.apps_script_web_app_url,
  updated_at = NOW();

WITH source_route AS (
  SELECT
    yr.project_id,
    yr.location_id
  FROM year_registry yr
  WHERE
    yr.spreadsheet_id =
      '1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8'
    AND yr.financial_year = 2026
  ORDER BY yr.updated_at DESC
  LIMIT 1
)
INSERT INTO user_locations (
  user_id,
  project_id,
  location_id,
  permissions
)
SELECT
  ul.user_id,
  ul.project_id,
  'alternatyva-test',
  ul.permissions
FROM source_route
INNER JOIN user_locations ul
  ON ul.project_id = source_route.project_id
  AND ul.location_id = source_route.location_id
INNER JOIN users u
  ON u.user_id = ul.user_id
  AND u.project_id = ul.project_id
WHERE
  u.status = 'ACTIVE'
  AND u.revoked_at IS NULL
  AND u.role IN ('SENIOR_ADMIN', 'OWNER', 'SYSTEM')
ON CONFLICT (user_id, project_id, location_id)
DO NOTHING;

COMMIT;