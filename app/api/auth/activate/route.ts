import {
  apiFail,
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  createId,
  createRandomToken,
  sha256
} from "@/lib/server/crypto";

import {
  db
} from "@/lib/server/db";

import {
  hashPassword
} from "@/lib/server/password";

import {
  SESSION_COOKIE_NAME
} from "@/lib/server/session";


export const runtime = "nodejs";


type InvitationRow = {
  invitationId: string;
  userId: string;
  projectId: string;
  locationId: string;
  displayName: string;
  role: string;
  tokenVersion: number;
  activeYear: number;
};


export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const body =
      await request
        .json()
        .catch(() => null) as
          | {
              token?: unknown;
              password?: unknown;
            }
          | null;


    const token =
      typeof body?.token === "string"
        ? body.token.trim()
        : "";


    const password =
      typeof body?.password === "string"
        ? body.password
        : "";


    if (
      token.length < 20
    ) {
      return apiFail(
        requestId,
        {
          status: 400,
          code:
            "INVALID_INVITATION_TOKEN",
          userMessage:
            "Посилання запрошення некоректне."
        }
      );
    }


    const normalizedPassword =
      password.normalize(
        "NFKC"
      );


    if (
      normalizedPassword.length < 8
    ) {
      return apiFail(
        requestId,
        {
          status: 400,
          code:
            "PASSWORD_TOO_SHORT",
          userMessage:
            "Пароль повинен містити щонайменше 8 символів."
        }
      );
    }


    if (
      normalizedPassword.length > 256
    ) {
      return apiFail(
        requestId,
        {
          status: 400,
          code:
            "PASSWORD_TOO_LONG",
          userMessage:
            "Пароль занадто довгий."
        }
      );
    }


    /*
     * Хешуємо пароль тільки на сервері.
     *
     * У Neon записується не пароль,
     * а scrypt hash із lib/server/password.ts.
     */
    const passwordHash =
      await hashPassword(
        normalizedPassword
      );


    const invitationHash =
      sha256(token);


    const sql =
      db();


    const sessionToken =
      createRandomToken(32);


    const sessionHash =
      sha256(
        sessionToken
      );


    const sessionId =
      createId("ses");


    const ttlHoursRaw =
      Number(
        process.env
          .SESSION_TTL_HOURS ??
        "12"
      );


    const ttlHours =
      Number.isFinite(
        ttlHoursRaw
      ) &&
      ttlHoursRaw > 0
        ? ttlHoursRaw
        : 12;


    const expiresAt =
      new Date(
        Date.now() +
        ttlHours *
          60 *
          60 *
          1000
      );


    const result =
      await sql.begin(
        async transaction => {
          /*
           * FOR UPDATE блокує конкретне
           * invitation під час активації.
           *
           * Два паралельні запити не зможуть
           * використати один invite двічі.
           */
          const rows =
            await transaction`
              SELECT
                i.invitation_id AS
                  "invitationId",

                u.user_id AS
                  "userId",

                u.project_id AS
                  "projectId",

                i.location_id AS
                  "locationId",

                u.display_name AS
                  "displayName",

                u.role AS
                  "role",

                u.token_version AS
                  "tokenVersion",

                p.active_year AS
                  "activeYear"

              FROM invitations i

              INNER JOIN users u
                ON u.user_id =
                   i.user_id

              INNER JOIN projects p
                ON p.project_id =
                   u.project_id
                AND p.project_id =
                   i.project_id

              INNER JOIN locations l
                ON l.project_id =
                   i.project_id
                AND l.location_id =
                   i.location_id

              INNER JOIN user_locations ul
                ON ul.user_id =
                   u.user_id
                AND ul.project_id =
                   i.project_id
                AND ul.location_id =
                   i.location_id

              WHERE
                i.token_hash =
                  ${invitationHash}

                AND i.used_at IS NULL

                AND i.expires_at >
                    NOW()

                AND u.status =
                    'ACTIVE'

                AND p.status =
                    'ACTIVE'

                AND l.status =
                    'ACTIVE'

              FOR UPDATE OF i

              LIMIT 1
            `;


          const invitation =
            rows[0] as unknown as
              InvitationRow |
              undefined;


          if (
            !invitation
          ) {
            return null;
          }


          /*
           * ГОЛОВНА НОВА ЧАСТИНА.
           *
           * Invitation підтверджує право
           * користувача встановити пароль.
           */
          await transaction`
            UPDATE users

            SET
              password_hash =
                ${passwordHash},

             password_reset_required =
               false


            WHERE
              user_id =
                ${invitation.userId}

              AND project_id =
                ${invitation.projectId}
          `;


          /*
           * Invitation стає одноразовим.
           */
          await transaction`
            UPDATE invitations

            SET
              used_at =
                NOW()

            WHERE
              invitation_id =
                ${invitation.invitationId}
          `;


          /*
           * Після успішної активації
           * одразу створюємо session.
           */
          await transaction`
            INSERT INTO sessions (
              session_id,
              user_id,
              project_id,
              location_id,
              token_hash,
              token_version,
              expires_at,
              last_seen_at
            )
            VALUES (
              ${sessionId},
              ${invitation.userId},
              ${invitation.projectId},
              ${invitation.locationId},
              ${sessionHash},
              ${invitation.tokenVersion},
              ${expiresAt},
              NOW()
            )
          `;


          const eventId =
            createId("evt");


          /*
           * НІКОЛИ не пишемо password
           * або password_hash в audit.
           */
          const afterSnapshot =
            JSON.stringify({
              sessionId,

              passwordConfigured:
                true,

              expiresAt:
                expiresAt.toISOString()
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
              ${invitation.userId},
              ${invitation.role},
              ${invitation.projectId},
              ${invitation.locationId},
              ${invitation.activeYear},
              'SESSION_ACTIVATE',
              'SESSION',
              ${sessionId},
              ${afterSnapshot}::jsonb,
              'COMPLETED'
            )
          `;


          return invitation;
        }
      );


    if (
      !result
    ) {
      return apiFail(
        requestId,
        {
          status: 401,
          code:
            "INVITATION_INVALID_OR_EXPIRED",
          userMessage:
            "Запрошення вже використане або термін його дії завершився."
        }
      );
    }


    const response =
      apiOk(
        requestId,
        {
          userId:
            result.userId,

          displayName:
            result.displayName,

          role:
            result.role,

          projectId:
            result.projectId,

          locationId:
            result.locationId,

          passwordConfigured:
            true
        },
        "Обліковий запис активовано.",
        "SESSION_CREATED"
      );


    response.cookies.set(
      SESSION_COOKIE_NAME,
      sessionToken,
      {
        httpOnly:
          true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite:
          "lax",

        path:
          "/",

        expires:
          expiresAt
      }
    );


    return response;

  } catch (
    error
  ) {
    return apiFromError(
      requestId,
      error
    );
  }
}