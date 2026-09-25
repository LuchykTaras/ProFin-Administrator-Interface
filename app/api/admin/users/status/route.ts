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
  revokedAt: Date | null;
};


type RequestedStatus =
  | "ACTIVE"
  | "INACTIVE";


function normalizeRequestedStatus(
  value: unknown
): RequestedStatus | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();


  /*
   * Фронтенд може надсилати
   * BLOCKED.
   *
   * У БД такого status немає.
   *
   * BLOCKED =
   * INACTIVE.
   */
  if (
    normalized ===
    "BLOCKED"
  ) {
    return "INACTIVE";
  }


  if (
    normalized ===
    "INACTIVE"
  ) {
    return "INACTIVE";
  }


  if (
    normalized ===
    "ACTIVE"
  ) {
    return "ACTIVE";
  }


  return null;
}


export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );


  try {
    /*
     * 1. Поточна
     *    авторизована сесія.
     */
    const context =
      await requireSessionContext();


    /*
     * 2. Перевіряємо право
     *    керування користувачами.
     */
    assertPermission(
      context,
      "users:manage"
    );


    /*
     * 3. Читаємо body.
     *
     * Підтримуємо:
     *
     * {
     *   userId,
     *   blocked: true
     * }
     *
     * {
     *   userId,
     *   blocked: false
     * }
     *
     * А також:
     *
     * {
     *   userId,
     *   status: "ACTIVE"
     * }
     *
     * {
     *   userId,
     *   status: "INACTIVE"
     * }
     *
     * І старий варіант:
     *
     * {
     *   userId,
     *   status: "BLOCKED"
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
              status?: unknown;
              blocked?: unknown;
            }
          | null;


    const userId =
      typeof body?.userId ===
        "string"
        ? body.userId.trim()
        : "";


    /*
     * Пріоритет має blocked,
     * тому що саме його зараз
     * надсилає OWNER UI.
     *
     * blocked: true
     *     -> INACTIVE
     *
     * blocked: false
     *     -> ACTIVE
     *
     * Якщо blocked немає —
     * використовуємо status.
     */
    const requestedStatus:
      RequestedStatus | null =
        typeof body?.blocked ===
          "boolean"
          ? body.blocked
            ? "INACTIVE"
            : "ACTIVE"
          : normalizeRequestedStatus(
              body?.status
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


    if (!requestedStatus) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "INVALID_USER_STATUS",

          userMessage:
            "Передано некоректний статус користувача."
        }
      );
    }


    /*
     * 4. Не дозволяємо OWNER
     *    змінювати власний status.
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
            "CANNOT_CHANGE_OWN_STATUS",

          userMessage:
            "Не можна змінювати статус власного облікового запису."
        }
      );
    }


    const sql =
      db();


    /*
     * 5. Вся операція
     *    виконується
     *    однією транзакцією.
     */
    const result =
      await sql.begin(
        async transaction => {
          /*
           * Блокуємо target user
           * на час зміни.
           */
          const rows =
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
                  "tokenVersion",

                revoked_at AS
                  "revokedAt"

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
            rows[0] as unknown as
              TargetUserRow |
              undefined;


          if (!targetUser) {
            return null;
          }


          /*
           * SYSTEM account
           * через цей endpoint
           * не змінюємо.
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
           * Якщо status уже
           * відповідає потрібному —
           * зайвий UPDATE
           * не виконуємо.
           */
          if (
            targetUser.status ===
            requestedStatus
          ) {
            return {
              type:
                "NO_CHANGE" as const,

              targetUser,

              newStatus:
                requestedStatus,

              revokedSessionCount:
                0,

              invalidatedInvitationCount:
                0,

              tokenVersion:
                Number(
                  targetUser.tokenVersion
                )
            };
          }


          let revokedSessionCount =
            0;


          let invalidatedInvitationCount =
            0;


          let newTokenVersion =
            Number(
              targetUser.tokenVersion
            );


          /*
           * 6A.
           *
           * BLOCK USER.
           *
           * У БД:
           *
           * status = INACTIVE
           */
          if (
            requestedStatus ===
            "INACTIVE"
          ) {
            /*
             * Робимо користувача
             * неактивним.
             *
             * token_version + 1
             * анулює старі токени.
             */
            const updatedUsers =
              await transaction`
                UPDATE users

                SET
                  status =
                    'INACTIVE',

                  revoked_at =
                    NOW(),

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


            newTokenVersion =
              Number(
                updatedUsers[0]
                  ?.tokenVersion ??
                Number(
                  targetUser.tokenVersion
                ) + 1
              );


            /*
             * Завершуємо всі
             * активні sessions
             * цього користувача.
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


            revokedSessionCount =
              revokedSessions.length;


            /*
             * У таблиці invitations
             * немає revoked_at.
             *
             * Тому активні
             * невикористані invitation
             * анулюємо через used_at.
             */
            const invalidatedInvitations =
              await transaction`
                UPDATE invitations

                SET
                  used_at =
                    NOW()

                WHERE
                  user_id =
                    ${userId}

                  AND project_id =
                    ${context.projectId}

                  AND used_at
                    IS NULL

                RETURNING
                  invitation_id
              `;


            invalidatedInvitationCount =
              invalidatedInvitations.length;
          }


          /*
           * 6B.
           *
           * UNBLOCK USER.
           *
           * Повертаємо:
           *
           * status = ACTIVE
           */
          if (
            requestedStatus ===
            "ACTIVE"
          ) {
            const updatedUsers =
              await transaction`
                UPDATE users

                SET
                  status =
                    'ACTIVE',

                  revoked_at =
                    NULL

                WHERE
                  user_id =
                    ${userId}

                  AND project_id =
                    ${context.projectId}

                RETURNING
                  token_version AS
                    "tokenVersion"
              `;


            newTokenVersion =
              Number(
                updatedUsers[0]
                  ?.tokenVersion ??
                targetUser.tokenVersion
              );
          }


          /*
           * 7. Audit.
           */
          const eventId =
            createId(
              "evt"
            );


          const action =
            requestedStatus ===
              "INACTIVE"
              ? "USER_BLOCKED"
              : "USER_UNBLOCKED";


          /*
           * JSON.stringify + ::jsonb
           * використовуємо так само,
           * як у виправленому
           * invitation endpoint.
           */
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

              previousStatus:
                targetUser.status,

              status:
                requestedStatus,

              blocked:
                requestedStatus ===
                "INACTIVE",

              revokedSessionCount,

              invalidatedInvitationCount,

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
              ${action},
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

            newStatus:
              requestedStatus,

            revokedSessionCount,

            invalidatedInvitationCount,

            tokenVersion:
              newTokenVersion
          };
        }
      );


    /*
     * 8. User не існує
     *    в поточному project.
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
     * 9. SYSTEM account
     *    захищений.
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
            "Системний обліковий запис не можна блокувати."
        }
      );
    }


    /*
     * 10. Status уже
     *     встановлений.
     */
    if (
      result.type ===
      "NO_CHANGE"
    ) {
      const blocked =
        result.newStatus ===
        "INACTIVE";


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

          status:
            result.newStatus,

          blocked,

          tokenVersion:
            result.tokenVersion,

          revokedSessionCount:
            0,

          invalidatedInvitationCount:
            0,

          changed:
            false
        },

        blocked
          ? "Користувач уже заблокований."
          : "Користувач уже активний.",

        "USER_STATUS_UNCHANGED"
      );
    }


    /*
     * 11. Success.
     */
    const isBlocked =
      result.newStatus ===
      "INACTIVE";


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

        status:
          result.newStatus,

        blocked:
          isBlocked,

        tokenVersion:
          result.tokenVersion,

        revokedSessionCount:
          result
            .revokedSessionCount,

        invalidatedInvitationCount:
          result
            .invalidatedInvitationCount,

        changed:
          true
      },

      isBlocked
        ? "Користувача заблоковано."
        : "Користувача розблоковано.",

      isBlocked
        ? "USER_BLOCKED"
        : "USER_UNBLOCKED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}