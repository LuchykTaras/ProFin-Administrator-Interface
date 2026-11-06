
import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import { db } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdentityRow = {
  emailPresent: boolean;
  googleProviderCandidate: boolean;
};

function parseDate(
  request: Request,
  activeYear: number
): string {
  const params = new URL(request.url).searchParams;
  const dates = params.getAll("date");

  if (
    [...params.keys()].some(key => key !== "date") ||
    dates.length !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dates[0])
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Некоректна дата зміни."
    });
  }

  const date = dates[0];
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Некоректна календарна дата."
    });
  }

  if (Number(date.slice(0, 4)) !== activeYear) {
    throw new AppError({
      status: 409,
      code: "SHIFT_YEAR_MISMATCH",
      userMessage: "Дата не відповідає активному року."
    });
  }

  return date;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "shift:read");

    const date = parseDate(
      request,
      context.activeYear
    );

    const route = await resolveAppsScriptAnnualRoute(
      context,
      date
    );

    const sql = db();

    const rows = await sql`
      SELECT
        (
          u.email IS NOT NULL
          AND LENGTH(TRIM(u.email)) > 0
        ) AS "emailPresent",

        EXISTS (
          SELECT 1
          FROM neon_auth."user" gu
          INNER JOIN neon_auth.account ga
            ON ga."userId" = gu.id
          WHERE
            LOWER(TRIM(gu.email)) =
              LOWER(TRIM(u.email))
            AND gu."emailVerified" = TRUE
            AND ga."providerId" = 'google'
        ) AS "googleProviderCandidate"

      FROM public.users u

      WHERE
        u.user_id = ${context.userId}
        AND u.project_id = ${context.projectId}
        AND u.role = ${context.role}
        AND u.status = 'ACTIVE'
        AND u.revoked_at IS NULL

      LIMIT 1
    `;

    const identity = rows[0] as
      | IdentityRow
      | undefined;

    if (!identity) {
      throw new AppError({
        status: 403,
        code: "IDENTITY_BINDING_NOT_FOUND",
        userMessage:
          "Не знайдено чинної прив'язки користувача."
      });
    }

    const candidate =
      identity.emailPresent === true &&
      identity.googleProviderCandidate === true;

    const response = apiOk(
      requestId,
      {
        version: "PROFIN_R1_02C_06_V1",
        date,

        session: {
          verified: true,
          role: context.role,
          projectId: context.projectId,
          locationId: context.locationId,
          activeYear: context.activeYear
        },

        identity: {
          profinEmailPresent:
            identity.emailPresent === true,

          googleProviderCandidate: candidate,

          googleIdentityVerified: false,
          oauthSubjectBound: false,
          googleTokenVerified: false,
          coreAclVerified: false
        },

        annualRoute: {
          verified: true,
          mode: route.routeMode,
          status: route.status
        },

        authorization: {
          shiftRead: true,
          shiftSnapshotAuthorized: false
        },

        integration: {
          hmacIdentityBridgeVerified: false,
          externalSnapshotEnabled: false,
          snapshotExecuted: false,
          financialDataRead: false,
          canSubmit: false
        },

        decision: "BLOCKED",
        reason: candidate
          ? "GOOGLE_ACCOUNT_CANDIDATE_ONLY"
          : "GOOGLE_ACCOUNT_BINDING_MISSING"
      },
      "Перевірено наявність кандидата Google-ідентичності. Фінансовий доступ заблокований.",
      "SHIFT_IDENTITY_LINK_AUDIT_OK"
    );

    response.headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return response;
  } catch (error) {
    const response = apiFromError(
      requestId,
      error
    );

    response.headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return response;
  }
}
