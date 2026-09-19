BEGIN;

-- ============================================================
-- PROFIN OS
-- PATCH 35
-- Cancellation / Transfer / Close Shift
--
-- PostgreSQL migration
-- Target: ProFin OS control-plane database
-- ============================================================


-- ============================================================
-- 1. YEAR REGISTRY
--
-- Server-side configuration for:
-- - cash accounts
-- - close-shift policy
-- ============================================================

ALTER TABLE year_registry
    ADD COLUMN IF NOT EXISTS cash_accounts JSONB
    NOT NULL
    DEFAULT '[]'::JSONB;


ALTER TABLE year_registry
    ADD COLUMN IF NOT EXISTS shift_policy JSONB
    NOT NULL
    DEFAULT '{}'::JSONB;


-- ============================================================
-- 2. JSON SHAPE GUARDS
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'year_registry_cash_accounts_json_chk'
    ) THEN

        ALTER TABLE year_registry
            ADD CONSTRAINT year_registry_cash_accounts_json_chk
            CHECK (
                jsonb_typeof(cash_accounts) = 'array'
            );

    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'year_registry_shift_policy_json_chk'
    ) THEN

        ALTER TABLE year_registry
            ADD CONSTRAINT year_registry_shift_policy_json_chk
            CHECK (
                jsonb_typeof(shift_policy) = 'object'
            );

    END IF;

END
$$;


-- ============================================================
-- 3. TRUSTED TRANSFER ROUTES
--
-- Browser sends route_id only.
--
-- spreadsheet_id is NOT stored in this table.
-- Source and destination annual workbooks are resolved through:
--
-- year_registry (
--   project_id,
--   location_id,
--   financial_year
-- )
-- ============================================================

CREATE TABLE IF NOT EXISTS transfer_routes (

    route_id TEXT PRIMARY KEY,

    project_id TEXT NOT NULL,

    source_location_id TEXT NOT NULL,

    destination_location_id TEXT NOT NULL,

    financial_year INTEGER NOT NULL,

    source_code TEXT NOT NULL,

    destination_code TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),


    CONSTRAINT transfer_routes_status_chk
        CHECK (
            status IN (
                'ACTIVE',
                'DISABLED'
            )
        ),


    CONSTRAINT transfer_routes_no_self_chk
        CHECK (
            source_location_id <>
            destination_location_id
        ),


    CONSTRAINT transfer_routes_unique_path
        UNIQUE (
            project_id,
            source_location_id,
            destination_location_id,
            financial_year
        ),


    CONSTRAINT transfer_routes_project_fk
        FOREIGN KEY (
            project_id
        )
        REFERENCES projects (
            project_id
        )
        ON DELETE CASCADE,


    CONSTRAINT transfer_routes_source_year_fk
        FOREIGN KEY (
            project_id,
            source_location_id,
            financial_year
        )
        REFERENCES year_registry (
            project_id,
            location_id,
            financial_year
        )
        ON DELETE CASCADE,


    CONSTRAINT transfer_routes_destination_year_fk
        FOREIGN KEY (
            project_id,
            destination_location_id,
            financial_year
        )
        REFERENCES year_registry (
            project_id,
            location_id,
            financial_year
        )
        ON DELETE CASCADE
);


-- ============================================================
-- 4. TRANSFER ROUTE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_transfer_routes_source
    ON transfer_routes (
        project_id,
        source_location_id,
        financial_year,
        status
    );


CREATE INDEX IF NOT EXISTS idx_transfer_routes_destination
    ON transfer_routes (
        project_id,
        destination_location_id,
        financial_year,
        status
    );


CREATE INDEX IF NOT EXISTS idx_transfer_routes_project_year
    ON transfer_routes (
        project_id,
        financial_year,
        status
    );


COMMIT;


-- ============================================================
-- EVERYTHING BELOW IS CONFIGURATION EXAMPLE ONLY.
--
-- IT IS COMMENTED OUT.
-- DO NOT REMOVE "--" UNTIL REAL IDs ARE KNOWN.
-- ============================================================


-- ============================================================
-- EXAMPLE 1
-- Add trusted transfer route
-- ============================================================

-- INSERT INTO transfer_routes (
--     route_id,
--     project_id,
--     source_location_id,
--     destination_location_id,
--     financial_year,
--     source_code,
--     destination_code,
--     status
-- )
-- VALUES (
--     'ROUTE_ALT_BAB_2026',
--     'YOUR_PROJECT_ID',
--     'ALT_LOCATION_ID',
--     'BAB_LOCATION_ID',
--     2026,
--     'ALT',
--     'BAB',
--     'ACTIVE'
-- )
--
-- ON CONFLICT (
--     project_id,
--     source_location_id,
--     destination_location_id,
--     financial_year
-- )
--
-- DO UPDATE SET
--     source_code =
--         EXCLUDED.source_code,
--
--     destination_code =
--         EXCLUDED.destination_code,
--
--     status =
--         EXCLUDED.status,
--
--     updated_at =
--         NOW();


-- ============================================================
-- EXAMPLE 2
-- Configure close-shift policy
--
-- helsiRequired MUST remain FALSE until
-- the immutable Helsi snapshot adapter is connected.
-- ============================================================

-- UPDATE year_registry
--
-- SET
--     cash_accounts =
--         jsonb_build_array(
--             'Каса, грн'
--         ),
--
--     shift_policy =
--         jsonb_build_object(
--
--             'openingBalance',
--             0,
--
--             'collectionOperationTypes',
--             jsonb_build_array(
--                 'Інкасація'
--             ),
--
--             'postedStatuses',
--             jsonb_build_array(
--                 'Проведено'
--             ),
--
--             'discrepancyTolerance',
--             0.01,
--
--             'blockOnProblemOperations',
--             FALSE,
--
--             'helsiRequired',
--             FALSE
--         ),
--
--     updated_at =
--         NOW()
--
-- WHERE
--     project_id =
--         'YOUR_PROJECT_ID'
--
--     AND location_id =
--         'YOUR_LOCATION_ID'
--
--     AND financial_year =
--         2026;


-- ============================================================
-- POST-MIGRATION CHECK 1
-- New columns
-- ============================================================

-- SELECT
--     ordinal_position,
--     column_name,
--     data_type,
--     is_nullable,
--     column_default
--
-- FROM information_schema.columns
--
-- WHERE
--     table_schema = 'public'
--
--     AND table_name =
--         'year_registry'
--
-- ORDER BY
--     ordinal_position;


-- ============================================================
-- POST-MIGRATION CHECK 2
-- transfer_routes exists
-- ============================================================

-- SELECT
--     table_name
--
-- FROM information_schema.tables
--
-- WHERE
--     table_schema = 'public'
--
--     AND table_name =
--         'transfer_routes';


-- ============================================================
-- POST-MIGRATION CHECK 3
-- transfer_routes structure
-- ============================================================

-- SELECT
--     ordinal_position,
--     column_name,
--     data_type,
--     is_nullable,
--     column_default
--
-- FROM information_schema.columns
--
-- WHERE
--     table_schema = 'public'
--
--     AND table_name =
--         'transfer_routes'
--
-- ORDER BY
--     ordinal_position;


-- ============================================================
-- POST-MIGRATION CHECK 4
-- Patch 35 constraints
-- ============================================================

-- SELECT
--     conname,
--     contype
--
-- FROM pg_constraint
--
-- WHERE
--     conrelid IN (
--         'year_registry'::regclass,
--         'transfer_routes'::regclass
--     )
--
--     AND (
--         conname LIKE
--             'transfer_routes%'
--
--         OR conname LIKE
--             'year_registry_%_json_chk'
--     )
--
-- ORDER BY
--     conname;