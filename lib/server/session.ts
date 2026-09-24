import "server-only";

import {
  cookies
} from "next/headers";

import {
  db
} from "@/lib/server/db";

import {
  sha256
} from "@/lib/server/crypto";

import {
  AppError
} from "@/lib/server/errors";


export const SESSION_COOKIE_NAME =
  "profin_session";


export type UserRole =
  | "CASHIER"
  | "SENIOR_ADMIN"
  | "OWNER"
  | "SYSTEM";


export type SessionContext = {
  sessionId: string;

  userId: string;
  displayName: string;
  role: UserRole;

  projectId: string;
  projectName: string;

  locationId: string;
  locationName: string;

  activeYear: number;

  timezone: string;
  locale: string;

  expiresAt: string;
};


type SessionRow = {
  sessionId: string;
  userId: string;
  displayName: string;
  role: UserRole;

  projectId: string;
  projectName: string;

  locationId: string;
  locationName: string;

  activeYear: number;

  timezone: string;
  locale: string;

  expiresAt: Date;
};


export async function getSessionContext():
Promise<SessionContext | null> {
  const cookieStore =
    await cookies();

  const rawToken =
    cookieStore.get(
      SESSION_COOKIE_NAME
    )?.value;

  if (!rawToken) {
    return null;
  }

  const tokenHash =
    sha256(rawToken);

  const sql = db();

  const rows = await sql`
    SELECT
      s.session_id AS "sessionId",

      u.user_id AS "userId",
      u.display_name AS "displayName",
      u.role AS "role",

      p.project_id AS "projectId",
      p.name AS "projectName",

      l.location_id AS "locationId",
      l.name AS "locationName",

      p.active_year AS "activeYear",

      p.timezone AS "timezone",
      p.locale AS "locale",

      s.expires_at AS "expiresAt"

    FROM sessions s

    INNER JOIN users u
      ON u.user_id = s.user_id

    INNER JOIN projects p
      ON p.project_id = s.project_id
      AND p.project_id = u.project_id

    INNER JOIN locations l
      ON l.project_id = s.project_id
      AND l.location_id = s.location_id

    INNER JOIN user_locations ul
      ON ul.user_id = u.user_id
      AND ul.project_id = s.project_id
      AND ul.location_id = s.location_id

    WHERE
      s.token_hash = ${tokenHash}

      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()

      AND s.token_version =
          u.token_version

      AND u.status = 'ACTIVE'
      AND u.revoked_at IS NULL

      AND p.status = 'ACTIVE'
      AND l.status = 'ACTIVE'

    LIMIT 1
  `;

  const row =
    rows[0] as unknown as
      SessionRow | undefined;

  if (!row) {
    return null;
  }

  await sql`
    UPDATE sessions

    SET last_seen_at = NOW()

    WHERE session_id =
      ${row.sessionId}
  `;

  return {
    sessionId:
      row.sessionId,

    userId:
      row.userId,

    displayName:
      row.displayName,

    role:
      row.role,

    projectId:
      row.projectId,

    projectName:
      row.projectName,

    locationId:
      row.locationId,

    locationName:
      row.locationName,

    activeYear:
      Number(row.activeYear),

    timezone:
      row.timezone,

    locale:
      row.locale,

    expiresAt:
      new Date(
        row.expiresAt
      ).toISOString()
  };
}


export async function requireSessionContext():
Promise<SessionContext> {
  const context =
    await getSessionContext();

  if (!context) {
    throw new AppError({
      status: 401,
      code: "UNAUTHENTICATED",
      userMessage:
        "Сесія відсутня або завершилася."
    });
  }

  return context;
}