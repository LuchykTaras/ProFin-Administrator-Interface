
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

import {
  assertPermission,
  hasPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = "status" | "owner" | "link";

function parseParams(
  request: Request,
  activeYear: number
): { date: string; check: Check } {
  const params = new URL(request.url).searchParams;
  const dates = params.getAll("date");
  const checks = params.getAll("check");

  const date = dates[0];
  const check = checks[0] ?? "status";

  if (
    dates.length !== 1 ||
    checks.length > 1 ||
    [...params.keys()].some(
      key => key !== "date" && key !== "check"
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ||
    !["status", "owner", "link"].includes(check)
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_IDENTITY_AUDIT_REQUEST",
      userMessage: "Некоректні параметри перевірки."
    });
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Некоректна дата."
    });
  }

  if (Number(date.slice(0, 4)) !== activeYear) {
    throw new AppError({
      status: 409,
      code: "SHIFT_YEAR_MISMATCH",
      userMessage: "Невідповідність облікового року."
    });
  }

  return { date, check: check as Check };
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "shift:read");

    const { date, check } = parseParams(
      request,
      context.activeYear
    );

    const route = await resolveAppsScriptAnnualRoute(
      context,
      date
    );

    if (check === "owner") {
      assertPermission(context, "users:manage");
    }

    const sql = db();

    const rows = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM public.profin_google_identity_links l
        WHERE
          l.project_id = ${context.projectId}
          AND l.user_id = ${context.userId}
          AND l.revoked_at IS NULL
      ) AS "activeLink"
    `;

    const activeLink = rows[0]?.activeLink === true;

    if (check === "link" && !activeLink) {
      throw new AppError({
        status: 403,
        code: "GOOGLE_LINK_INACTIVE",
        userMessage:
          "Активної Google-прив'язки не знайдено."
      });
    }

    const response = apiOk(
      requestId,
      {
        version: "PROFIN_R1_02C_09_V1",

        identity: {
          verifiedProfinSession: true,
          role: context.role,
          projectId: context.projectId,
          locationId: context.locationId,
          activeYear: context.activeYear
        },

        permissions: {
          shiftRead: true,
          usersManage: hasPermission(
            context,
            "users:manage"
          )
        },

        googleLink: {
          active: activeLink,
          status: activeLink
            ? "ACTIVE"
            : "MISSING_OR_REVOKED"
        },

        annualRoute: {
          verified: true,
          mode: route.routeMode,
          status: route.status
        },

        integration: {
          googleIdentityVerifiedForRequest: false,
          appsScriptAclVerified: false,
          externalSnapshotEnabled: false,
          financialDataRead: false,
          canSubmit: false
        },

        decision: "BLOCKED"
      },
      "Сесію, роль і Google-прив'язку перевірено.",
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
