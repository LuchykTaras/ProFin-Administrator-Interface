import {
  randomBytes
} from "node:crypto";

import {
  apiFail,
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  createId,
  sha256
} from "@/lib/server/crypto";

import {
  db
} from "@/lib/server/db";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime =
  "nodejs";


const INVITATION_TTL_HOURS =
  24;


const ALLOWED_MANAGED_ROLES = [
  "CASHIER",
  "SENIOR_ADMIN",
  "OWNER"
] as const;


type ManagedRole =
  typeof ALLOWED_MANAGED_ROLES[number];


type UserLocation = {
  locationId: string;
  locationName: string;
};


type AvailableLocationRow = {
  locationId: string;
  locationName: string;
};


type UserListRow = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  status: string;

  passwordSet: boolean;
  passwordResetRequired: boolean;

  tokenVersion: number;

  revokedAt: Date | null;

  activeSessionCount: number;

  locations: UserLocation[];
};


type EditableUserRow = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  tokenVersion: number;
};


function normalizeString(
  value: unknown
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}


function normalizeEmail(
  value: unknown
) {
  return normalizeString(
    value
  ).toLowerCase();
}


function normalizeLocationIds(
  value: unknown
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item ===
              "string"
        )
        .map(
          item =>
            item.trim()
        )
        .filter(
          Boolean
        )
    )
  );
}


function isManagedRole(
  value: string
): value is ManagedRole {
  return (
    ALLOWED_MANAGED_ROLES as
      readonly string[]
  ).includes(
    value
  );
}


async function getProjectLocations(
  projectId: string
) {
  const sql =
    db();

  const rows =
    await sql`
      SELECT
        location_id AS
          "locationId",

        name AS
          "locationName"

      FROM locations

      WHERE
        project_id =
          ${projectId}

      ORDER BY
        name ASC
    `;

  return rows.map(
    row =>
      row as unknown as
        AvailableLocationRow
  );
}


function validateRequestedLocations(
  requestedLocationIds: string[],
  availableLocations: AvailableLocationRow[]
) {
  const allowed =
    new Set(
      availableLocations.map(
        item =>
          item.locationId
      )
    );

  return requestedLocationIds.every(
    locationId =>
      allowed.has(
        locationId
      )
  );
}


/*
 * ============================================================
 * GET
 *
 * Список користувачів + усі доступні філії проекту.
 * ============================================================
 */
export async function GET(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );

  try {
    const context =
      await requireSessionContext();


    assertPermission(
      context,
      "users:manage"
    );


    const sql =
      db();


    const rows =
      await sql`
        SELECT
          u.user_id AS
            "userId",

          u.display_name AS
            "displayName",

          u.email AS
            "email",

          u.role AS
            "role",

          u.status AS
            "status",

          (
            u.password_hash
            IS NOT NULL
          ) AS
            "passwordSet",

          u.password_reset_required AS
            "passwordResetRequired",

          u.token_version AS
            "tokenVersion",

          u.revoked_at AS
            "revokedAt",

          COUNT(
            DISTINCT s.session_id
          ) FILTER (
            WHERE
              s.revoked_at
                IS NULL

              AND s.expires_at >
                NOW()
          )::int AS
            "activeSessionCount",

          COALESCE(
            jsonb_agg(
              DISTINCT
              jsonb_build_object(
                'locationId',
                  l.location_id,

                'locationName',
                  l.name
              )
            ) FILTER (
              WHERE
                l.location_id
                  IS NOT NULL
            ),

            '[]'::jsonb
          ) AS
            "locations"

        FROM users u

        LEFT JOIN user_locations ul
          ON ul.user_id =
            u.user_id

          AND ul.project_id =
            u.project_id

        LEFT JOIN locations l
          ON l.location_id =
            ul.location_id

          AND l.project_id =
            u.project_id

        LEFT JOIN sessions s
          ON s.user_id =
            u.user_id

          AND s.project_id =
            u.project_id

        WHERE
          u.project_id =
            ${context.projectId}

        GROUP BY
          u.user_id,
          u.display_name,
          u.email,
          u.role,
          u.status,
          u.password_hash,
          u.password_reset_required,
          u.token_version,
          u.revoked_at

        ORDER BY
          CASE u.role
            WHEN 'OWNER'
              THEN 1

            WHEN 'SENIOR_ADMIN'
              THEN 2

            WHEN 'CASHIER'
              THEN 3

            WHEN 'SYSTEM'
              THEN 4

            ELSE 5
          END,

          u.display_name ASC
      `;


    const users =
      rows.map(
        row => {
          const item =
            row as unknown as
              UserListRow;

          return {
            userId:
              item.userId,

            displayName:
              item.displayName,

            email:
              item.email,

            role:
              item.role,

            status:
              item.status,

            passwordSet:
              Boolean(
                item.passwordSet
              ),

            passwordResetRequired:
              Boolean(
                item
                  .passwordResetRequired
              ),

            tokenVersion:
              Number(
                item.tokenVersion
              ),

            revokedAt:
              item.revokedAt
                ? new Date(
                    item.revokedAt
                  ).toISOString()
                : null,

            activeSessionCount:
              Number(
                item
                  .activeSessionCount
              ),

            locations:
              Array.isArray(
                item.locations
              )
                ? item.locations
                : [],

            isCurrentUser:
              item.userId ===
              context.userId
          };
        }
      );


    const availableLocations =
      await getProjectLocations(
        context.projectId
      );


    return apiOk(
      requestId,
      {
        users,

        total:
          users.length,

        projectId:
          context.projectId,

        currentUserId:
          context.userId,

        availableLocations
      },

      "Список користувачів отримано.",

      "USERS_LISTED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}


/*
 * ============================================================
 * POST
 *
 * Створення нового користувача +
 * первинне invitation-посилання.
 * ============================================================
 */
export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );

  try {
    const context =
      await requireSessionContext();


    assertPermission(
      context,
      "users:manage"
    );


    const body =
      await request
        .json()
        .catch(
          () => null
        ) as
          | {
              displayName?: unknown;
              email?: unknown;
              role?: unknown;
              locationIds?: unknown;
            }
          | null;


    const displayName =
      normalizeString(
        body?.displayName
      );


    const email =
      normalizeEmail(
        body?.email
      );


    const role =
      normalizeString(
        body?.role
      );


    const locationIds =
      normalizeLocationIds(
        body?.locationIds
      );


    if (
      displayName.length <
        2
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_DISPLAY_NAME",

          userMessage:
            "Вкажіть ім’я користувача."
        }
      );
    }


    if (
      !email ||
      !email.includes(
        "@"
      )
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_EMAIL",

          userMessage:
            "Вкажіть коректну електронну пошту."
        }
      );
    }


    if (
      !isManagedRole(
        role
      )
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_ROLE",

          userMessage:
            "Передано некоректну роль користувача."
        }
      );
    }


    if (
      locationIds.length ===
        0
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "LOCATION_REQUIRED",

          userMessage:
            "Виберіть хоча б одну філію."
        }
      );
    }


    const availableLocations =
      await getProjectLocations(
        context.projectId
      );


    if (
      !validateRequestedLocations(
        locationIds,
        availableLocations
      )
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_LOCATION",

          userMessage:
            "Одна або декілька вибраних філій недоступні."
        }
      );
    }


    const sql =
      db();


    const rawToken =
      randomBytes(
        32
      ).toString(
        "base64url"
      );


    const tokenHash =
      sha256(
        rawToken
      );


    const userId =
      createId(
        "usr"
      );


    const invitationId =
      createId(
        "inv"
      );


    const expiresAt =
      new Date(
        Date.now() +
          INVITATION_TTL_HOURS *
            60 *
            60 *
            1000
      );


    const primaryLocationId =
      locationIds[0];


    const result =
      await sql.begin(
        async transaction => {
          /*
           * Email використовується
           * для входу, тому не допускаємо
           * дублікати.
           */
          const existingUsers =
            await transaction`
              SELECT
                user_id

              FROM users

              WHERE
                LOWER(email) =
                  ${email}

              LIMIT 1
            `;


          if (
            existingUsers.length >
              0
          ) {
            return {
              type:
                "EMAIL_EXISTS" as const
            };
          }


          /*
           * Створюємо account.
           *
           * Пароля ще немає.
           * Його встановить сам
           * користувач через invitation.
           */
          await transaction`
            INSERT INTO users (
              user_id,
              project_id,
              display_name,
              email,
              role,
              status,
              password_hash,
              password_reset_required,
              token_version,
              revoked_at
            )
            VALUES (
              ${userId},
              ${context.projectId},
              ${displayName},
              ${email},
              ${role},
              'ACTIVE',
              NULL,
              FALSE,
              1,
              NULL
            )
          `;


          /*
           * Прив’язуємо всі
           * вибрані філії.
           */
          for (
            const locationId
            of locationIds
          ) {
            await transaction`
              INSERT INTO user_locations (
                user_id,
                project_id,
                location_id
              )
              VALUES (
                ${userId},
                ${context.projectId},
                ${locationId}
              )

              ON CONFLICT
                DO NOTHING
            `;
          }


          /*
           * Первинне invitation.
           */
          await transaction`
            INSERT INTO invitations (
              invitation_id,
              user_id,
              project_id,
              location_id,
              token_hash,
              expires_at,
              created_by
            )
            VALUES (
              ${invitationId},
              ${userId},
              ${context.projectId},
              ${primaryLocationId},
              ${tokenHash},
              ${expiresAt},
              ${context.userId}
            )
          `;


          /*
           * Audit.
           */
          const eventId =
            createId(
              "evt"
            );


          const afterSnapshot =
            JSON.stringify({
              targetUserId:
                userId,

              targetDisplayName:
                displayName,

              targetEmail:
                email,

              targetRole:
                role,

              locationIds,

              invitationId,

              expiresAt:
                expiresAt
                  .toISOString()
            });


          await transaction`
            INSERT INTO audit_events (
              event_id,
              request_id,
              actor_user_id,
              actor_role,
              project_id,
              location_id,
              financial_year,
              action,
              target_type,
              target_id,
              after_snapshot,
              result
            )
            VALUES (
              ${eventId},
              ${requestId},
              ${context.userId},
              ${context.role},
              ${context.projectId},
              ${context.locationId},
              ${context.activeYear},
              'USER_CREATED',
              'USER',
              ${userId},
              ${afterSnapshot}::jsonb,
              'COMPLETED'
            )
          `;


          return {
            type:
              "SUCCESS" as const
          };
        }
      );


    if (
      result.type ===
      "EMAIL_EXISTS"
    ) {
      return apiFail(
        requestId,
        {
          status: 409,

          code:
            "EMAIL_ALREADY_EXISTS",

          userMessage:
            "Користувач з такою електронною поштою вже існує."
        }
      );
    }


    const origin =
      new URL(
        request.url
      ).origin;


    const invitationUrl =
      `${origin}/activate?token=${encodeURIComponent(
        rawToken
      )}`;


    return apiOk(
      requestId,
      {
        userId,

        displayName,

        email,

        role,

        locationIds,

        invitationId,

        invitationUrl,

        expiresAt:
          expiresAt
            .toISOString(),

        expiresInHours:
          INVITATION_TTL_HOURS
      },

      "Користувача створено. Invitation-посилання готове.",

      "USER_CREATED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}


/*
 * ============================================================
 * PATCH
 *
 * Редагування:
 * - ім’я;
 * - роль;
 * - доступні філії.
 *
 * Після зміни role/location:
 * - token_version +1;
 * - усі активні сесії користувача
 *   завершуються.
 * ============================================================
 */
export async function PATCH(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );

  try {
    const context =
      await requireSessionContext();


    assertPermission(
      context,
      "users:manage"
    );


    const body =
      await request
        .json()
        .catch(
          () => null
        ) as
          | {
              userId?: unknown;
              displayName?: unknown;
              role?: unknown;
              locationIds?: unknown;
            }
          | null;


    const userId =
      normalizeString(
        body?.userId
      );


    const displayName =
      normalizeString(
        body?.displayName
      );


    const role =
      normalizeString(
        body?.role
      );


    const locationIds =
      normalizeLocationIds(
        body?.locationIds
      );


    if (!userId) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_USER_ID",

          userMessage:
            "Не вказано користувача."
        }
      );
    }


    /*
     * Власний OWNER-account
     * через цю панель не редагуємо.
     */
    if (
      userId ===
      context.userId
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "CANNOT_EDIT_SELF",

          userMessage:
            "Адміністративне редагування власного профілю вимкнене."
        }
      );
    }


    if (
      displayName.length <
        2
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_DISPLAY_NAME",

          userMessage:
            "Вкажіть ім’я користувача."
        }
      );
    }


    if (
      !isManagedRole(
        role
      )
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_ROLE",

          userMessage:
            "Передано некоректну роль користувача."
        }
      );
    }


    if (
      locationIds.length ===
        0
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "LOCATION_REQUIRED",

          userMessage:
            "Користувач повинен мати хоча б одну доступну філію."
        }
      );
    }


    const availableLocations =
      await getProjectLocations(
        context.projectId
      );


    if (
      !validateRequestedLocations(
        locationIds,
        availableLocations
      )
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_LOCATION",

          userMessage:
            "Одна або декілька вибраних філій недоступні."
        }
      );
    }


    const sql =
      db();


    const result =
      await sql.begin(
        async transaction => {
          const targetRows =
            await transaction`
              SELECT
                user_id AS
                  "userId",

                display_name AS
                  "displayName",

                email AS
                  "email",

                role AS
                  "role",

                status AS
                  "status",

                token_version AS
                  "tokenVersion"

              FROM users

              WHERE
                user_id =
                  ${userId}

                AND project_id =
                  ${context.projectId}

              FOR UPDATE

              LIMIT 1
            `;


          const targetUser =
            targetRows[0] as
              | EditableUserRow
              | undefined;


          if (!targetUser) {
            return null;
          }


          /*
           * SYSTEM-account через
           * OWNER UI не змінюємо.
           */
          if (
            targetUser.role ===
            "SYSTEM"
          ) {
            return {
              type:
                "SYSTEM_USER" as const
            };
          }


          /*
           * Змінюємо ім’я,
           * роль і token version.
           *
           * token_version +1
           * миттєво інвалідує
           * старий access context.
           */
          await transaction`
            UPDATE users

            SET
              display_name =
                ${displayName},

              role =
                ${role},

              token_version =
                token_version + 1

            WHERE
              user_id =
                ${userId}

              AND project_id =
                ${context.projectId}
          `;


          /*
           * Повністю замінюємо
           * доступні філії.
           */
          await transaction`
            DELETE FROM user_locations

            WHERE
              user_id =
                ${userId}

              AND project_id =
                ${context.projectId}
          `;


          for (
            const locationId
            of locationIds
          ) {
            await transaction`
              INSERT INTO user_locations (
                user_id,
                project_id,
                location_id
              )
              VALUES (
                ${userId},
                ${context.projectId},
                ${locationId}
              )

              ON CONFLICT
                DO NOTHING
            `;
          }


          /*
           * Після зміни role/location
           * завершуємо старі сесії.
           */
          const revokedSessions =
            await transaction`
              UPDATE sessions

              SET
                revoked_at =
                  NOW()

              WHERE
                user_id =
                  ${userId}

                AND project_id =
                  ${context.projectId}

                AND revoked_at
                  IS NULL

              RETURNING
                session_id
            `;


          const eventId =
            createId(
              "evt"
            );


          const afterSnapshot =
            JSON.stringify({
              targetUserId:
                userId,

              previousDisplayName:
                targetUser.displayName,

              displayName,

              targetEmail:
                targetUser.email,

              previousRole:
                targetUser.role,

              role,

              locationIds,

              previousTokenVersion:
                Number(
                  targetUser
                    .tokenVersion
                ),

              revokedSessionCount:
                revokedSessions.length
            });


          await transaction`
            INSERT INTO audit_events (
              event_id,
              request_id,
              actor_user_id,
              actor_role,
              project_id,
              location_id,
              financial_year,
              action,
              target_type,
              target_id,
              after_snapshot,
              result
            )
            VALUES (
              ${eventId},
              ${requestId},
              ${context.userId},
              ${context.role},
              ${context.projectId},
              ${context.locationId},
              ${context.activeYear},
              'USER_UPDATED',
              'USER',
              ${userId},
              ${afterSnapshot}::jsonb,
              'COMPLETED'
            )
          `;


          return {
            type:
              "SUCCESS" as const,

            revokedSessionCount:
              revokedSessions.length
          };
        }
      );


    if (!result) {
      return apiFail(
        requestId,
        {
          status: 404,

          code:
            "USER_NOT_FOUND",

          userMessage:
            "Користувача не знайдено."
        }
      );
    }


    if (
      result.type ===
      "SYSTEM_USER"
    ) {
      return apiFail(
        requestId,
        {
          status: 403,

          code:
            "SYSTEM_USER_PROTECTED",

          userMessage:
            "Системний обліковий запис не можна змінювати через OWNER-панель."
        }
      );
    }


    return apiOk(
      requestId,
      {
        userId,

        displayName,

        role,

        locationIds,

        revokedSessionCount:
          result
            .revokedSessionCount
      },

      "Дані користувача оновлено.",

      "USER_UPDATED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}