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
  email: string;
  role: string;
  status: string;
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
    /*
     * 1. Поточна сесія OWNER.
     */
    const context =
      await requireSessionContext();


    /*
     * 2. Перевірка права.
     */
    assertPermission(
      context,
      "users:manage"
    );


    /*
     * 3. Body.
     *
     * {
     *   userId: "usr-demo-cashier"
     * }
     */
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
     * OWNER UI вже блокує
     * admin-дії для самого себе.
     *
     * Але backend теж
     * захищаємо.
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
            "CANNOT_REVOKE_OWN_SESSIONS",

          userMessage:
            "Не можна завершити всі сесії власного облікового запису через цю команду."
        }
      );
    }


    const sql =
      db();


    /*
     * 4. Одна транзакція.
     */
    const result =
      await sql.begin(
        async transaction => {
          /*
           * Блокуємо користувача
           * на час операції.
           */
          const userRows =
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
            userRows[0] as unknown as
              TargetUserRow |
              undefined;


          if (!targetUser) {
            return null;
          }


          /*
           * SYSTEM account
           * не чіпаємо.
           */
          if (
            targetUser.role ===
            "SYSTEM"
          ) {
            return {
              type:
                "SYSTEM_USER" as const,

              targetUser
            };
          }


          /*
           * 5. Завершуємо
           * всі ще не revoked sessions.
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
           * 6. Піднімаємо
           * token_version.
           *
           * Навіть якщо cookie/token
           * десь залишився,
           * він більше не валідний.
           */
          const updatedUsers =
            await transaction`
              UPDATE users

              SET
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
              updatedUsers[0]
                ?.tokenVersion ??
              Number(
                targetUser.tokenVersion
              ) + 1
            );


          /*
           * 7. Audit.
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
                targetUser.displayName,

              targetEmail:
                targetUser.email,

              targetRole:
                targetUser.role,

              revokedSessionCount:
                revokedSessions.length,

              tokenVersion:
                newTokenVersion
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

              'SESSION_REVOKE_ALL',

              'USER',

              ${userId},

              ${afterSnapshot}::jsonb,

              'COMPLETED'
            )
          `;


          return {
            type:
              "SUCCESS" as const,

            targetUser,

            revokedSessionCount:
              revokedSessions.length,

            tokenVersion:
              newTokenVersion
          };
        }
      );


    /*
     * 8. User відсутній.
     */
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


    /*
     * 9. SYSTEM protected.
     */
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
            "Системний обліковий запис не можна змінювати."
        }
      );
    }


    /*
     * 10. Success.
     */
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

        email:
          result
            .targetUser
            .email,

        role:
          result
            .targetUser
            .role,

        revokedSessionCount:
          result
            .revokedSessionCount,

        tokenVersion:
          result
            .tokenVersion
      },

      result.revokedSessionCount > 0
        ? "Усі активні сесії користувача завершено."
        : "Активних сесій користувача немає.",

      "SESSIONS_REVOKED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}