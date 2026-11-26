import "server-only";

import {
  db
} from "@/lib/server/db";

import type {
  SessionContext
} from "@/lib/server/session";


const SHIFT_ADMIN_NAMES = [
  "Бородинський адміни",
  "Савчишкіна Марина Іванівна",
  "Лебідь Маргарита Ігорівна",
  "Бабурка",
  "Волошина Олена Василівна",
  "Суханова Надія Юріївна"
] as const;


function normalizeName(
  value: string
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}


function getDefaultAdminNames(): string[] {
  return SHIFT_ADMIN_NAMES.map(
    name => normalizeName(name)
  );
}


function mergeAdminNames(
  databaseNames: string[]
): string[] {
  const allowedNames =
    getDefaultAdminNames();

  const allowedSet =
    new Set(allowedNames);

  const result =
    new Set<string>(allowedNames);

  for (const rawName of databaseNames) {
    const name =
      normalizeName(rawName);

    if (
      !name ||
      !allowedSet.has(name)
    ) {
      continue;
    }

    result.add(name);
  }

  return Array.from(result);
}


export async function getShiftAdminOptions(
  context: SessionContext
): Promise<string[]> {
  const defaultNames =
    getDefaultAdminNames();

  try {
    const sql = db();

    const rows = await sql`
      SELECT DISTINCT
        u.display_name AS "displayName"

      FROM users u

      INNER JOIN user_locations ul
        ON ul.user_id = u.user_id
        AND ul.project_id = u.project_id

      INNER JOIN locations l
        ON l.project_id = ul.project_id
        AND l.location_id = ul.location_id

      WHERE
        u.project_id = ${context.projectId}

        AND ul.location_id = ${context.locationId}

        AND u.role = 'SENIOR_ADMIN'

        AND u.status = 'ACTIVE'

        AND u.revoked_at IS NULL

        AND l.status = 'ACTIVE'

      ORDER BY "displayName" ASC
    `;

    const databaseNames =
      rows.map(row =>
        normalizeName(
          String(
            row.displayName ?? ""
          )
        )
      );

    return mergeAdminNames(
      databaseNames
    );

  } catch (error) {
    console.warn(
      "[SHIFT_ADMIN_OPTIONS_DB_FALLBACK]",
      error instanceof Error
        ? error.message
        : "Database unavailable"
    );

    return defaultNames;
  }
}