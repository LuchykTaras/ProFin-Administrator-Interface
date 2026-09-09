import {
  cookies
} from "next/headers";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  sha256
} from "@/lib/server/crypto";

import {
  db
} from "@/lib/server/db";

import {
  SESSION_COOKIE_NAME
} from "@/lib/server/session";


export const runtime = "nodejs";


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
      const sql = db();

      const tokenHash =
        sha256(rawToken);

      await sql`
        UPDATE sessions

        SET revoked_at = NOW()

        WHERE
          token_hash =
            ${tokenHash}

          AND revoked_at IS NULL
      `;
    }

    const response =
      apiOk(
        requestId,
        {
          loggedOut: true
        },
        "Сесію завершено.",
        "SESSION_REVOKED"
      );

    response.cookies.set(
      SESSION_COOKIE_NAME,
      "",
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "lax",

        path: "/",

        maxAge: 0
      }
    );

    return response;
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}