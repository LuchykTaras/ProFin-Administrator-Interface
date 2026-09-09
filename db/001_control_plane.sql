BEGIN;

CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,

    folder_id TEXT,

    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    active_year INTEGER NOT NULL,

    timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    locale TEXT NOT NULL DEFAULT 'uk-UA',

    template_version TEXT,

    access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS locations (
    project_id TEXT NOT NULL
        REFERENCES projects(project_id)
        ON DELETE CASCADE,

    location_id TEXT NOT NULL,

    name TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (project_id, location_id)
);


CREATE TABLE IF NOT EXISTS year_registry (
    project_id TEXT NOT NULL,

    location_id TEXT NOT NULL,

    financial_year INTEGER NOT NULL,

    spreadsheet_id TEXT NOT NULL,
    folder_id TEXT,

    schema_version TEXT NOT NULL,
    template_version TEXT,

    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (
            status IN (
                'DRAFT',
                'PREFLIGHT_FAILED',
                'READY',
                'ACTIVE',
                'READ_ONLY',
                'ARCHIVED'
            )
        ),

    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    config_checksum TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (
        project_id,
        location_id,
        financial_year
    ),

    FOREIGN KEY (
        project_id,
        location_id
    )
    REFERENCES locations (
        project_id,
        location_id
    )
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,

    project_id TEXT NOT NULL
        REFERENCES projects(project_id)
        ON DELETE CASCADE,

    display_name TEXT NOT NULL,

    email TEXT,

    role TEXT NOT NULL
        CHECK (
            role IN (
                'CASHIER',
                'SENIOR_ADMIN',
                'OWNER',
                'SYSTEM'
            )
        ),

    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE'
            )
        ),

    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,

    token_version INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS user_locations (
    user_id TEXT NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    project_id TEXT NOT NULL,

    location_id TEXT NOT NULL,

    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,

    PRIMARY KEY (
        user_id,
        project_id,
        location_id
    ),

    FOREIGN KEY (
        project_id,
        location_id
    )
    REFERENCES locations (
        project_id,
        location_id
    )
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS invitations (
    invitation_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    project_id TEXT NOT NULL,

    location_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_by TEXT,

    FOREIGN KEY (
        project_id,
        location_id
    )
    REFERENCES locations (
        project_id,
        location_id
    )
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    project_id TEXT NOT NULL,

    location_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    token_version INTEGER NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    revoked_at TIMESTAMPTZ,

    device_label TEXT,

    FOREIGN KEY (
        project_id,
        location_id
    )
    REFERENCES locations (
        project_id,
        location_id
    )
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS operation_index (
    operation_id TEXT PRIMARY KEY,

    project_id TEXT NOT NULL,

    location_id TEXT NOT NULL,

    financial_year INTEGER NOT NULL,

    spreadsheet_id TEXT NOT NULL,

    status TEXT NOT NULL,

    locator TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS audit_events (
    event_id TEXT PRIMARY KEY,

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    request_id TEXT NOT NULL,

    actor_user_id TEXT,

    actor_role TEXT,

    project_id TEXT,

    location_id TEXT,

    financial_year INTEGER,

    action TEXT NOT NULL,

    target_type TEXT,

    target_id TEXT,

    reason TEXT,

    before_snapshot JSONB,

    after_snapshot JSONB,

    checksum_before TEXT,

    result TEXT NOT NULL,

    rollback_event_id TEXT
);


CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
    ON sessions(token_hash);


CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);


CREATE INDEX IF NOT EXISTS idx_invitations_token_hash
    ON invitations(token_hash);


CREATE INDEX IF NOT EXISTS idx_operation_index_project
    ON operation_index(project_id, operation_id);


CREATE INDEX IF NOT EXISTS idx_audit_events_request
    ON audit_events(request_id);


COMMIT;