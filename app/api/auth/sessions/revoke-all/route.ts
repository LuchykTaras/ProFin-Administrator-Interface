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


    if (
      userId ===
      context.userId
    ) {
      return apiFail(
        requestId,
        {
          status: 400,

          code:
            "CANNOT_REVOKE_CURRENT_USER",

          userMessage:
            "Для завершення власної сесії використайте кнопку виходу."
        }
      );
    }


    const sql =
      db();


    const result =
      await sql.begin(
        async transaction => {
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


          const versionRows =
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


          const eventId =
            createId(
              "evt"
            );


          const afterSnapshot =
            JSON.stringify({
              revokedSessionCount:
                revokedSessions.length,

              tokenVersion:
                newTokenVersion,

              targetUserId:
                userId,

              targetDisplayName:
                targetUser
                  .displayName
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

        revokedSessionCount:
          result
            .revokedSessionCount,

        tokenVersion:
          result
            .tokenVersion
      },
      "Усі сесії користувача завершено.",
      "USER_SESSIONS_REVOKED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}