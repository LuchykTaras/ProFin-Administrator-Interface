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


type TargetUserRow = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  revokedAt: Date | null;
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
     * 1. Поточна авторизована сесія.
     */
    const context =
      await requireSessionContext();


    /*
     * 2. Reissue invitation
     * дозволений тільки тому,
     * хто має users:manage.
     *
     * Зараз це OWNER / SYSTEM.
     */
    assertPermission(
      context,
      "users:manage"
    );


    /*
     * 3. Отримуємо userId.
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
     * 4. OWNER не перевидає
     * invitation самому собі
     * через цей endpoint.
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
            "CANNOT_REISSUE_SELF_INVITATION",

          userMessage:
            "Не можна перевидати invitation для власного облікового запису."
        }
      );
    }


    /*
     * 5. Новий одноразовий token.
     *
     * Raw token у БД
     * не зберігаємо.
     */
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


    const sql =
      db();


    /*
     * 6. Вся операція
     * виконується транзакційно.
     */
    const result =
      await sql.begin(
        async transaction => {
          /*
           * 6.1.
           * Знаходимо користувача
           * тільки всередині project
           * поточного OWNER.
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
            userRows[0] as unknown as
              TargetUserRow |
              undefined;


          if (!targetUser) {
            return null;
          }


          /*
           * 6.2.
           * Заблокованому або
           * неактивному користувачу
           * invitation не видаємо.
           */
          if (
            targetUser.status !==
              "ACTIVE" ||
            targetUser.revokedAt !==
              null
          ) {
            return {
              type:
                "USER_INACTIVE" as const,

              targetUser
            };
          }


          /*
           * 6.3.
           * У поточній схемі
           * invitations НЕ має
           * revoked_at.
           *
           * Тому попередні
           * невикористані активні
           * invitation позначаємо
           * використаними.
           */
          const revokedInvitations =
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

                AND expires_at >
                  NOW()

              RETURNING
                invitation_id
            `;


          /*
           * 6.4.
           * Створюємо нове
           * invitation.
           *
           * Реальні колонки таблиці:
           *
           * invitation_id
           * user_id
           * project_id
           * location_id
           * token_hash
           * expires_at
           * used_at
           * created_at
           * created_by
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
              ${context.locationId},
              ${tokenHash},
              ${expiresAt},
              ${context.userId}
            )
          `;


          /*
           * 6.5.
           * Audit snapshot.
           *
           * Спочатку робимо
           * звичайний JSON string,
           * а SQL явно приводить
           * його до jsonb.
           *
           * Це усуває помилку:
           *
           * could not determine
           * data type of parameter
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

              invitationId,

              revokedInvitationCount:
                revokedInvitations.length,

              expiresAt:
                expiresAt.toISOString()
            });


          /*
           * 6.6.
           * Audit event.
           */
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
              'INVITATION_REISSUED',
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

            revokedInvitationCount:
              revokedInvitations.length
          };
        }
      );


    /*
     * 7. User не існує
     * у цьому project.
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
     * 8. User заблокований
     * або неактивний.
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
            "Неможливо створити invitation для неактивного або заблокованого користувача."
        }
      );
    }


    /*
     * 9. Формуємо URL.
     *
     * Raw token повертаємо
     * тільки у цій відповіді.
     *
     * У БД знаходиться
     * лише token hash.
     */
    const origin =
      new URL(
        request.url
      ).origin;


    const invitationUrl =
      `${origin}/activate?token=${encodeURIComponent(
        rawToken
      )}`;


    /*
     * 10. Успішна відповідь.
     */
    return apiOk(
      requestId,
      {
        invitationId,

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

        invitationUrl,

        expiresAt:
          expiresAt
            .toISOString(),

        expiresInHours:
          INVITATION_TTL_HOURS,

        revokedInvitationCount:
          result
            .revokedInvitationCount
      },

      "Нове invitation-посилання створено.",

      "INVITATION_REISSUED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}