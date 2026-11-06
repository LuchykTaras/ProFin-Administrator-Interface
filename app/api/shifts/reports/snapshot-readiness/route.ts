
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

type LinkRow = {
  linkCount: number;
  uniqueSubjects: number;
  sharedSubject: boolean;
};

function validateDate(
  request: Request,
  activeYear: number
): string {
  const params = new URL(request.url).searchParams;
  const dates = params.getAll("date");

  if (
    dates.length !== 1 ||
    [...params.keys()].some(key => key !== "date") ||
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
    parsed.toISOString().slice(0, 10) !== date ||
    Number(date.slice(0, 4)) !== activeYear
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Дата не відповідає обліковому року."
    });
  }

  return date;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "shift:read");

    const date = validateDate(
      request,
      context.activeYear
    );

    const annualRoute =
      await resolveAppsScriptAnnualRoute(
        context,
        date
      );

    const sql = db();

    const rows = await sql`
      WITH all_active AS (
        SELECT user_id, google_sub
        FROM public.profin_google_identity_links
        WHERE project_id = ${context.projectId}
          AND revoked_at IS NULL
      ),
      own AS (
        SELECT google_sub
        FROM all_active
        WHERE user_id = ${context.userId}
      )
      SELECT
        (SELECT COUNT(*) FROM own)::int
          AS "linkCount",
        (SELECT COUNT(DISTINCT google_sub) FROM own)::int
          AS "uniqueSubjects",
        EXISTS (
          SELECT 1
          FROM all_active other
          INNER JOIN own
            ON own.google_sub = other.google_sub
          WHERE other.user_id <> ${context.userId}
        ) AS "sharedSubject"
    `;

    const link = rows[0] as LinkRow | undefined;
    const linkCount = Number(link?.linkCount ?? 0);

    if (linkCount !== 1) {
      throw new AppError({
        status: linkCount === 0 ? 403 : 409,
        code: linkCount === 0
          ? "GOOGLE_LINK_INACTIVE"
          : "GOOGLE_LINK_NOT_UNIQUE",
        userMessage:
          "Не підтверджено єдину активну Google-прив'язку."
      });
    }

    if (
      Number(link?.uniqueSubjects) !== 1 ||
      link?.sharedSubject !== false
    ) {
      throw new AppError({
        status: 409,
        code: "GOOGLE_SUB_IDENTITY_CONFLICT",
        userMessage:
          "Виявлено конфлікт Google-ідентичності."
      });
    }

    const response = apiOk(
      requestId,
      {
        version: "PROFIN_R3_03A_READINESS_V1",
        date,

        identity: {
          sessionVerified: true,
          userId: context.userId,
          role: context.role,
          projectId: context.projectId,
          locationId: context.locationId,
          activeYear: context.activeYear
        },

        google: {
          activeLinkVerified: true,
          uniqueSubjectVerified: true,
          tokenVerifiedForRequest: false,
          personalOauthVerified: false,
          appsScriptAclVerified: false
        },

        annualRoute: {
          resolved: true,
          projectBound:
            annualRoute.projectId === context.projectId,
          locationBound:
            annualRoute.locationId === context.locationId,
          yearBound:
            annualRoute.year === context.activeYear,
          mode: annualRoute.routeMode,
          status: annualRoute.status
        },

        snapshot: {
          externalSnapshotEnabled: false,
          snapshotExecuted: false,
          financialDataRead: false,
          metrics: null,
          accounts: null,
          revision: null,
          canSubmit: false
        },

        blockingReasons: [
          "PERSONAL_GOOGLE_OAUTH_NOT_VERIFIED",
          "APPS_SCRIPT_ACL_NOT_VERIFIED",
          "EXTERNAL_SNAPSHOT_CONTRACT_NOT_VERIFIED"
        ],

        decision: "BLOCKED"
      },
      "Сесію, Google-прив'язку та річний маршрут перевірено. Фінансове читання ще не дозволено.",
      "SHIFT_R3_03A_PREFLIGHT_OK"
    );

    response.headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return response;
  } catch (error) {
    const response = apiFromError(requestId, error);

    response.headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return response;
  }
}
