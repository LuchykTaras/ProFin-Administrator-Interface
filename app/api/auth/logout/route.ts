import {
  cookies
} from "next/headers";

import {
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
  SESSION_COOKIE_NAME
} from "@/lib/server/session";


export const runtime =
  "nodejs";


type LogoutSessionRow = {
  sessionId: string;
  userId: string;
  role: string;
  projectId: string;
  locationId: string;
  activeYear: number;
};


export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const cookieStore =
      await cookies();

    const rawToken =
      cookieStore.get(
        SESSION_COOKIE_NAME
      )?.value;


    if (rawToken) {
      const sql =
        db();

      const tokenHash =
        sha256(
          rawToken
        );


      await sql.begin(
        async transaction => {
          const rows =
            await transaction`
              SELECT
                s.session_id AS
                  "sessionId",

                s.user_id AS
                  "userId",

                u.role AS
                  "role",

                s.project_id AS
                  "projectId",

                s.location_id AS
                  "locationId",

                p.active_year AS
                  "activeYear"

              FROM sessions s

              INNER JOIN users u
                ON u.user_id =
                   s.user_id

              INNER JOIN projects p
                ON p.project_id =
                   s.project_id

              WHERE
                s.token_hash =
                  ${tokenHash}

                AND s.revoked_at
                  IS NULL

              LIMIT 1

              FOR UPDATE OF s
            `;


          const session =
            rows[0] as unknown as
              LogoutSessionRow |
              undefined;


          if (!session) {
            return;
          }


          await transaction`
            UPDATE sessions

            SET
              revoked_at =
                NOW()

            WHERE
              session_id =
                ${session.sessionId}

              AND revoked_at
                IS NULL
          `;


          const eventId =
            createId(
              "evt"
            );


          const afterSnapshot =
            JSON.stringify({
              sessionId:
                session.sessionId,

              revoked:
                true
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
              ${session.userId},
              ${session.role},
              ${session.projectId},
              ${session.locationId},
              ${session.activeYear},
              'SESSION_LOGOUT',
              'SESSION',
              ${session.sessionId},
              ${afterSnapshot}::jsonb,
              'COMPLETED'
            )
          `;
        }
      );
    }


    const response =
      apiOk(
        requestId,
        {
          loggedOut:
            true
        },
        "Сесію завершено.",
        "SESSION_REVOKED"
      );


    response.cookies.set(
      SESSION_COOKIE_NAME,
      "",
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

        maxAge:
          0
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