
import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import {
  AppError
} from "@/lib/server/errors";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validateDate(
  request: Request,
  activeYear: number
): string {
  const params = new URL(request.url).searchParams;
  const dates = params.getAll("date");

  const date = dates.length === 1
    ? dates[0]
    : null;

  if (
    !date ||
    [...params.keys()].some(key => key !== "date") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Оберіть коректну дату зміни."
    });
  }

  const parsed = new Date(
    `${date}T00:00:00.000Z`
  );

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
      userMessage:
        "Дата не відповідає активному обліковому року."
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

    const route = await resolveAppsScriptAnnualRoute(
      context,
      date
    );

    const response = apiOk(
      requestId,
      {
        version: "PROFIN_R1_02C_05_IDENTITY_V1",

        date,

        identity: {
          source: "PROFIN_NEON_SESSION",
          verified: true,
          role: context.role,
          projectId: context.projectId,
          locationId: context.locationId,
          activeYear: context.activeYear
        },

        permissions: {
          shiftRead: true,
          shiftSnapshotAuthorized: false
        },

        annualRoute: {
          verified: true,
          projectBound: true,
          locationBound: true,
          yearBound: true,
          mode: route.routeMode,
          status: route.status
        },

        google: {
          endUserIdentityVerified: false,
          coreAclVerified: false,
          libraryWorkbookVerified: false
        },

        integration: {
          hmacIdentityBridgeVerified: false,
          externalSnapshotEnabled: false,
          snapshotExecuted: false,
          financialDataRead: false,
          canSubmit: false
        },

        decision: "BLOCKED"
      },
      "Сесію, права та маршрут перевірено. Доступ до фінансового snapshot ще заблокований.",
      "SHIFT_IDENTITY_PREFLIGHT_OK"
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
