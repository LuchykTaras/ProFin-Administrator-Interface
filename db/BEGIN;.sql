-- BEGIN;

-- ALTER TABLE year_registry
--     ADD COLUMN IF NOT EXISTS cash_accounts JSONB
--     NOT NULL
--     DEFAULT '[]'::JSONB;

-- ALTER TABLE year_registry
--     ADD COLUMN IF NOT EXISTS shift_policy JSONB
--     NOT NULL
--     DEFAULT '{}'::JSONB;

-- DO $$
-- BEGIN

--     IF NOT EXISTS (
--         SELECT 1
--         FROM pg_constraint
--         WHERE conname = 'year_registry_cash_accounts_json_chk'
--     ) THEN

--         ALTER TABLE year_registry
--             ADD CONSTRAINT year_registry_cash_accounts_json_chk
--             CHECK (
--                 jsonb_typeof(cash_accounts) = 'array'
--             );

--     END IF;

--     IF NOT EXISTS (
--         SELECT 1
--         FROM pg_constraint
--         WHERE conname = 'year_registry_shift_policy_json_chk'
--     ) THEN

--         ALTER TABLE year_registry
--             ADD CONSTRAINT year_registry_shift_policy_json_chk
--             CHECK (
--                 jsonb_typeof(shift_policy) = 'object'
--             );

--     END IF;

-- END
-- $$;

-- CREATE TABLE IF NOT EXISTS transfer_routes (

--     route_id TEXT PRIMARY KEY,

--     project_id TEXT NOT NULL,

--     source_location_id TEXT NOT NULL,

--     destination_location_id TEXT NOT NULL,

--     financial_year INTEGER NOT NULL,

--     source_code TEXT NOT NULL,

--     destination_code TEXT NOT NULL,

--     status TEXT NOT NULL
--         DEFAULT 'ACTIVE',

--     created_at TIMESTAMPTZ
--         NOT NULL
--         DEFAULT NOW(),

--     updated_at TIMESTAMPTZ
--         NOT NULL
--         DEFAULT NOW(),

--     CONSTRAINT transfer_routes_status_chk
--         CHECK (
--             status IN (
--                 'ACTIVE',
--                 'DISABLED'
--             )
--         ),

--     CONSTRAINT transfer_routes_no_self_chk
--         CHECK (
--             source_location_id <>
--             destination_location_id
--         ),

--     CONSTRAINT transfer_routes_unique_path
--         UNIQUE (
--             project_id,
--             source_location_id,
--             destination_location_id,
--             financial_year
--         ),

--     CONSTRAINT transfer_routes_project_fk
--         FOREIGN KEY (
--             project_id
--         )
--         REFERENCES projects (
--             project_id
--         )
--         ON DELETE CASCADE,

--     CONSTRAINT transfer_routes_source_year_fk
--         FOREIGN KEY (
--             project_id,
--             source_location_id,
--             financial_year
--         )
--         REFERENCES year_registry (
--             project_id,
--             location_id,
--             financial_year
--         )
--         ON DELETE CASCADE,

--     CONSTRAINT transfer_routes_destination_year_fk
--         FOREIGN KEY (
--             project_id,
--             destination_location_id,
--             financial_year
--         )
--         REFERENCES year_registry (
--             project_id,
--             location_id,
--             financial_year
--         )
--         ON DELETE CASCADE
-- );

-- CREATE INDEX IF NOT EXISTS idx_transfer_routes_source
--     ON transfer_routes (
--         project_id,
--         source_location_id,
--         financial_year,
--         status
--     );

-- CREATE INDEX IF NOT EXISTS idx_transfer_routes_destination
--     ON transfer_routes (
--         project_id,
--         destination_location_id,
--         financial_year,
--         status
--     );

-- CREATE INDEX IF NOT EXISTS idx_transfer_routes_project_year
--     ON transfer_routes (
--         project_id,
--         financial_year,
--         status
--     );

-- COMMIT;

-- SELECT
--     column_name,
--     data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'year_registry'
--   AND column_name IN (
--       'cash_accounts',
--       'shift_policy'
--   )

-- UNION ALL

-- SELECT
--     table_name,
--     'TABLE'
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name = 'transfer_routes';

-- SELECT
--     project_id,
--     location_id,
--     financial_year,
--     status,
--     spreadsheet_id,
--     schema_version,
--     cash_accounts,
--     shift_policy
-- FROM year_registry
-- ORDER BY
--     project_id,
--     location_id,
--     financial_year;

-- SELECT
--     project_id,
--     location_id,
--     name,
--     status
-- FROM locations
-- ORDER BY
--     project_id,
--     location_id;

-- SELECT
--     project_id,
--     name,
--     status,
--     active_year
-- FROM projects
-- ORDER BY
--     project_id;

-- BEGIN;

-- UPDATE year_registry
-- SET
--     cash_accounts = jsonb_build_array(
--         'Каса, грн'
--     ),

--     shift_policy = jsonb_build_object(
--         'openingBalance', 0,

--         'collectionOperationTypes',
--         jsonb_build_array(
--             'Інкасація'
--         ),

--         'postedStatuses',
--         jsonb_build_array(
--             'Проведено'
--         ),

--         'discrepancyTolerance', 0.01,

--         'blockOnProblemOperations', FALSE,

--         'helsiRequired', FALSE
--     ),

--     updated_at = NOW()

-- WHERE project_id = 'demo-project'
--   AND location_id = 'main'
--   AND financial_year = 2026
--   AND status = 'ACTIVE';

-- COMMIT;

-- SELECT
--     project_id,
--     location_id,
--     financial_year,
--     status,
--     cash_accounts,
--     shift_policy
-- FROM year_registry
-- WHERE project_id = 'demo-project'
--   AND location_id = 'main'
--   AND financial_year = 2026;

SELECT
    project_id,
    location_id,
    financial_year,
    cash_accounts,
    jsonb_pretty(shift_policy) AS shift_policy
FROM year_registry
WHERE project_id = 'demo-project'
  AND location_id = 'main'
  AND financial_year = 2026;