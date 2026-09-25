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
  passwordSet: boolean;
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
    /*
     * 1. Поточний OWNER.
     */
    const context =
      await requireSessionContext();


    /*
     * 2. users:manage.
     */
    assertPermission(
      context,
      "users:manage"
    );


    /*
     * 3. Body:
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
     * Не дозволяємо OWNER
     * скидати пароль самому собі
     * через admin UI.
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
            "CANNOT_RESET_OWN_PASSWORD",

          userMessage:
            "Не можна скинути пароль власного облікового запису через цю команду."
        }
      );
    }


    const sql =
      db();


    /*
     * 4. Транзакція.
     */
    const result =
      await sql.begin(
        async transaction => {
          /*
           * Target user.
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

                (
                  password_hash
                  IS NOT NULL
                ) AS
                  "passwordSet",

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
           * захищений.
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
           * Не дозволяємо
           * reset для INACTIVE user.
           *
           * Спочатку його треба
           * розблокувати.
           */
          if (
            targetUser.status !==
            "ACTIVE"
          ) {
            return {
              type:
                "USER_INACTIVE" as const,

              targetUser
            };
          }


          /*
           * 5. Встановлюємо
           * password_reset_required.
           *
           * Сам password_hash
           * НЕ видаляємо.
           *
           * Login endpoint повинен
           * заборонити звичайний вхід,
           * доки password_reset_required
           * = true.
           *
           * token_version + 1
           * інвалідовує старі tokens.
           */
          const updatedUsers =
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
                  "tokenVersion",

                password_reset_required AS
                  "passwordResetRequired"
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
           * 6. Завершуємо
           * всі sessions.
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
           * 7.
           *
           * Старі invitation тут
           * навмисно не створюємо.
           *
           * OWNER після цього може
           * використати кнопку
           * "Перевидати доступ".
           */


          /*
           * 8. Audit.
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

              passwordConfigured:
                Boolean(
                  targetUser.passwordSet
                ),

              passwordResetRequired:
                true,

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

              'PASSWORD_RESET_REQUIRED',

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
     * 9. User not found.
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
     * 10. SYSTEM.
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
     * 11. Inactive.
     */
    if (
      result.type ===
      "USER_INACTIVE"
    ) {
      return apiFail(
        requestId,
        {
          status: 409,

          code:
            "USER_NOT_ACTIVE",

          userMessage:
            "Спочатку розблокуйте користувача."
        }
      );
    }


    /*
     * 12. Success.
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

        passwordResetRequired:
          true,

        revokedSessionCount:
          result
            .revokedSessionCount,

        tokenVersion:
          result
            .tokenVersion
      },

      "Для користувача встановлено обов’язкову зміну пароля.",

      "PASSWORD_RESET_REQUIRED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}