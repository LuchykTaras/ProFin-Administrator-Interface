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
  verifyPassword
} from "@/lib/server/password";

import {
  SESSION_COOKIE_NAME
} from "@/lib/server/session";


export const runtime =
  "nodejs";


type LoginUserRow = {
  userId:
    string;

  displayName:
    string;

  role:
    string;

  projectId:
    string;

  locationId:
    string;

  passwordHash:
    string | null;

  passwordResetRequired:
    boolean;

  tokenVersion:
    number;

  activeYear:
    number;
};


export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );

  try {
    const body =
      await request
        .json()
        .catch(
          () => null
        ) as
          | {
              email?: unknown;
              password?: unknown;
            }
          | null;


    const email =
      typeof body?.email ===
        "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";


    const password =
      typeof body?.password ===
        "string"
        ? body.password
        : "";


    if (
      !email ||
      !email.includes("@") ||
      password.length < 8
    ) {
      return apiFail(
        requestId,
        {
          status:
            400,

          code:
            "INVALID_LOGIN_INPUT",

          userMessage:
            "Введіть коректну електронну пошту та пароль."
        }
      );
    }


    const sql =
      db();


    const rows =
      await sql`
        SELECT
          u.user_id AS
            "userId",

          u.display_name AS
            "displayName",

          u.role AS
            "role",

          u.project_id AS
            "projectId",

          ul.location_id AS
            "locationId",

          u.password_hash AS
            "passwordHash",

          u.password_reset_required AS
            "passwordResetRequired",

          u.token_version AS
            "tokenVersion",

          p.active_year AS
            "activeYear"

        FROM users u

        INNER JOIN projects p
          ON p.project_id =
             u.project_id

        INNER JOIN user_locations ul
          ON ul.user_id =
             u.user_id
          AND ul.project_id =
             u.project_id

        INNER JOIN locations l
          ON l.project_id =
             ul.project_id
          AND l.location_id =
             ul.location_id

        WHERE
          lower(u.email) =
            ${email}

          AND u.status =
            'ACTIVE'

          AND u.revoked_at
            IS NULL

          AND p.status =
            'ACTIVE'

          AND l.status =
            'ACTIVE'

        ORDER BY
          ul.location_id

        LIMIT 1
      `;


    const user =
      rows[0] as unknown as
        LoginUserRow |
        undefined;


    if (
      !user ||
      !user.passwordHash
    ) {
      return apiFail(
        requestId,
        {
          status:
            401,

          code:
            "INVALID_CREDENTIALS",

          userMessage:
            "Невірна електронна пошта або пароль."
        }
      );
    }


    const passwordValid =
      await verifyPassword(
        password,
        user.passwordHash
      );


    if (
      !passwordValid
    ) {
      return apiFail(
        requestId,
        {
          status:
            401,

          code:
            "INVALID_CREDENTIALS",

          userMessage:
            "Невірна електронна пошта або пароль."
        }
      );
    }


    if (
      user
        .passwordResetRequired
    ) {
      return apiFail(
        requestId,
        {
          status:
            403,

          code:
            "PASSWORD_RESET_REQUIRED",

          userMessage:
            "Для цього облікового запису потрібно встановити новий пароль."
        }
      );
    }


    const sessionToken =
      createRandomToken(
        32
      );


    const sessionHash =
      sha256(
        sessionToken
      );


    const sessionId =
      createId(
        "ses"
      );


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


    await sql.begin(
      async transaction => {
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
            ${user.userId},
            ${user.projectId},
            ${user.locationId},
            ${sessionHash},
            ${user.tokenVersion},
            ${expiresAt},
            NOW()
          )
        `;


        const eventId =
          createId(
            "evt"
          );


        const afterSnapshot =
          JSON.stringify({
            sessionId,
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
            ${user.userId},
            ${user.role},
            ${user.projectId},
            ${user.locationId},
            ${user.activeYear},
            'SESSION_LOGIN',
            'SESSION',
            ${sessionId},
            ${afterSnapshot}::jsonb,
            'COMPLETED'
          )
        `;
      }
    );


    const response =
      apiOk(
        requestId,
        {
          userId:
            user.userId,

          displayName:
            user.displayName,

          role:
            user.role,

          projectId:
            user.projectId,

          locationId:
            user.locationId,

          expiresAt:
            expiresAt
              .toISOString()
        },
        "Вхід виконано.",
        "LOGIN_SUCCESS"
      );


    response.cookies.set(
      SESSION_COOKIE_NAME,
      sessionToken,
      {
        httpOnly:
          true,

        secure:
          process.env
            .NODE_ENV ===
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