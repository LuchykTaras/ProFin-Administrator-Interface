import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({
  path: ".env.local"
});

if (
  process.env.ALLOW_DEV_SEED !==
  "1"
) {
  throw new Error(
    "Set ALLOW_DEV_SEED=1 before running dev seed."
  );
}

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required."
  );
}

const isLocal =
  databaseUrl.includes("localhost") ||
  databaseUrl.includes("127.0.0.1");

const sql = postgres(
  databaseUrl,
  {
    max: 1,
    ssl:
      isLocal
        ? false
        : "require"
  }
);

const projectId =
  process.env.DEV_PROJECT_ID ??
  "demo-project";

const projectName =
  process.env.DEV_PROJECT_NAME ??
  "ProFin Demo";

const locationId =
  process.env.DEV_LOCATION_ID ??
  "main";

const locationName =
  process.env.DEV_LOCATION_NAME ??
  "Основна";

const userId =
  process.env.DEV_USER_ID ??
  "usr-demo-cashier";

const displayName =
  process.env.DEV_USER_NAME ??
  "Тестовий касир";

const activeYear =
  Number(
    process.env.DEV_ACTIVE_YEAR ??
    "2026"
  );

try {
  await sql`
    INSERT INTO projects (
      project_id,
      name,
      status,
      active_year,
      timezone,
      locale
    )
    VALUES (
      ${projectId},
      ${projectName},
      'ACTIVE',
      ${activeYear},
      'Europe/Kyiv',
      'uk-UA'
    )

    ON CONFLICT (project_id)
    DO UPDATE SET
      name =
        EXCLUDED.name,

      status =
        'ACTIVE',

      active_year =
        EXCLUDED.active_year,

      updated_at =
        NOW()
  `;

  await sql`
    INSERT INTO locations (
      project_id,
      location_id,
      name,
      status
    )
    VALUES (
      ${projectId},
      ${locationId},
      ${locationName},
      'ACTIVE'
    )

    ON CONFLICT (
      project_id,
      location_id
    )
    DO UPDATE SET
      name =
        EXCLUDED.name,

      status =
        'ACTIVE',

      updated_at =
        NOW()
  `;

  await sql`
    INSERT INTO users (
      user_id,
      project_id,
      display_name,
      role,
      status
    )
    VALUES (
      ${userId},
      ${projectId},
      ${displayName},
      'CASHIER',
      'ACTIVE'
    )

    ON CONFLICT (user_id)
    DO UPDATE SET
      display_name =
        EXCLUDED.display_name,

      role =
        'CASHIER',

      status =
        'ACTIVE'
  `;

  await sql`
    INSERT INTO user_locations (
      user_id,
      project_id,
      location_id
    )
    VALUES (
      ${userId},
      ${projectId},
      ${locationId}
    )

    ON CONFLICT (
      user_id,
      project_id,
      location_id
    )
    DO NOTHING
  `;

  console.log(
    "Development control-plane seed completed."
  );

  console.log({
    projectId,
    locationId,
    userId,
    activeYear
  });
} finally {
  await sql.end();
}