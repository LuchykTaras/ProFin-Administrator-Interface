import {
  apiFail,
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  createId
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


type TargetUserRow = {
  userId: string;
  displayName: string;
  role: string;
  status: string;
  passwordResetRequired: boolean;
  tokenVersion: number;
};


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


    /*
     * Тільки OWNER / SYSTEM,
     * тому що permission users:manage
     * зараз є саме у цих ролей.
     */
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
            }
          | null;


    const userId =
      typeof body?.userId ===
        "string"
        ? body.userId.trim()
        : "";


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
     * Не дозволяємо OWNER випадково
     * заблокувати самого себе.
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
            "CANNOT_RESET_CURRENT_USER",

          userMessage:
            "Неможливо скинути пароль власного облікового запису цією командою."
        }
      );
    }


    const sql =
      db();


    const result =
      await sql.begin(
        async transaction => {
          /*
           * Блокуємо рядок користувача
           * на час транзакції.
           */
          const userRows =
            await transaction`
              SELECT
                user_id AS
                  "userId",

                display_name AS
                  "displayName",

                role AS
                  "role",

                status AS
                  "status",

                password_reset_required AS
                  "passwordResetRequired",

                token_version AS
                  "tokenVersion"

              FROM users

              WHERE
                user_id =
                  ${userId}

                AND project_id =
                  ${context.projectId}

                AND revoked_at
                  IS NULL

              FOR UPDATE

              LIMIT 1
            `;


          const targetUser =
            userRows[0] as unknown as
              TargetUserRow |
              undefined;


          if (!targetUser) {
            return null;
          }


          /*
           * Ставимо вимогу створити
           * новий пароль.
           *
           * Старий password_hash
           * НЕ видаляємо.
           */
          const versionRows =
            await transaction`
              UPDATE users

              SET
                password_reset_required =
                  true,

                token_version =
                  token_version + 1

              WHERE
                user_id =
                  ${userId}

                AND project_id =
                  ${context.projectId}

              RETURNING
                token_version AS
                  "tokenVersion"
            `;


          const newTokenVersion =
            Number(
              (
                versionRows[0] as
                  | {
                      tokenVersion:
                        number;
                    }
                  | undefined
              )?.tokenVersion ??
              targetUser
                .tokenVersion +
                1
            );


          /*
           * Одразу завершуємо всі
           * поточні сесії користувача.
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


          /*
           * Audit.
           */
          const eventId =
            createId(
              "evt"
            );


          const beforeSnapshot =
            JSON.stringify({
              passwordResetRequired:
                targetUser
                  .passwordResetRequired,

              tokenVersion:
                targetUser
                  .tokenVersion
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
              before_snapshot,
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
              'PASSWORD_RESET_REQUIRED',
              'USER',
              ${userId},
              ${beforeSnapshot}::jsonb,
              jsonb_build_object(
             'targetUserId',
             ${userId},

            'targetDisplayName',
             ${targetUser.displayName},

             'targetRole',
              ${targetUser.role},

             'passwordResetRequired',
             TRUE,

             'revokedSessionCount',
             ${revokedSessions.length},

             'tokenVersion',
             ${newTokenVersion}
              ),
              'COMPLETED'
            )
          `;


          return {
            targetUser,

            revokedSessionCount:
              revokedSessions.length,

            tokenVersion:
              newTokenVersion
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


    return apiOk(
      requestId,
      {
        userId:
          result
            .targetUser
            .userId,

        displayName:
          result
            .targetUser
            .displayName,

        passwordResetRequired:
          true,

        revokedSessionCount:
          result
            .revokedSessionCount,

        tokenVersion:
          result
            .tokenVersion
      },
      "Для користувача увімкнено обов'язкове створення нового пароля.",
      "PASSWORD_RESET_REQUIRED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}