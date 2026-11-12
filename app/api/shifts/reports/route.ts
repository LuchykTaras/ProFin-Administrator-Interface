import {
  requireR3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";


import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  AppError
} from "@/lib/server/errors";

import {
  requireSessionContext
} from "@/lib/server/session";

import {
  assertPermission
} from "@/lib/server/rbac";

import type {
  ShiftReportsData
} from "@/lib/contracts/shift-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdapterData = {
  result?: ShiftReportsData;
};

function parseInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === null) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_REPORT_PERIOD",
      userMessage: "Некоректний період звіту."
    });
  }

  const value = Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_REPORT_PERIOD",
      userMessage: "Некоректний період звіту."
    });
  }

  return value;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

assertPermission(context, "shift:read");

if (
  context.role !== "OWNER" &&
  context.role !== "SENIOR_ADMIN"
) {
  throw new AppError({
    status: 403,
    code: "SHIFT_HISTORY_ROLE_DENIED",
    userMessage: "Недостатньо прав для перегляду історії.",
    retryable: false
  });
}

const url = new URL(request.url);
    const params = url.searchParams;

    for (const key of params.keys()) {
      if (!["year", "month", "shiftId"].includes(key)) {
        throw new AppError({
          status: 400,
          code: "UNKNOWN_SHIFT_REPORT_PARAMETER",
          userMessage: "Невідомий параметр звіту."
        });
      }
    }

    const year = parseInteger(
      params.get("year"),
      context.activeYear,
      2000,
      2100
    );

    const month = parseInteger(
      params.get("month"),
      0,
      0,
      12
    );

    const shiftId =
      params.get("shiftId")?.trim() || null;

    if (
      shiftId &&
      (shiftId.length > 160 || month === 0)
    ) {
      throw new AppError({
        status: 400,
        code: "INVALID_SHIFT_REPORT_ID",
        userMessage: "Некоректний ідентифікатор звіту."
      });
    }

    // Historical routes require their own authorized
    // read-only registry resolver. Fail closed for now.
    if (year !== context.activeYear) {
      throw new AppError({
        status: 409,
        code: "HISTORICAL_YEAR_ROUTE_NOT_CONNECTED",
        userMessage:
          "Для цього року ще не підключено історичний маршрут."
      });
    }

    if (
  process.env.PROFIN_R3_BAB_ACL_BRIDGE_ENABLED !== "true" ||
  process.env.PROFIN_R3_BAB_FINANCIAL_READ_ENABLED !== "true"
) {
  throw new AppError({
    status: 403,
    code: "SHIFT_HISTORY_READ_DISABLED",
    userMessage: "Фінансове читання вимкнено.",
    retryable: false
  });
}

const identity = await requireR3BabVerifiedIdentity(
  context,
  `${year}-01-01`
);

    const adapter = await callAppsScriptAdapter<
      {
      month: number;
      shiftId: string | null;
      identity: typeof identity;
      },
      AdapterData
    >({
      requestId,
      command: "getShiftReportsWeb",
      context,
      idempotencyKey: null,
      signal: request.signal,
      payload: {
      month,
      shiftId,
      identity
      }
    });

    const result = adapter.data?.result;

    if (
      !result ||
      !Array.isArray(result.reports) ||
      !Array.isArray(result.details) ||
      !Array.isArray(result.kpiDetails) ||
      !Array.isArray(result.summary?.months) ||
      result.year !== year ||
      result.month !== month
    ) {
      throw new AppError({
        status: 502,
        code: "INVALID_SHIFT_REPORT_RESPONSE",
        userMessage:
          "Ядро повернуло некоректну історію звітів."
      });
    }

    if (
      shiftId &&
      result.selectedReport?.shiftId !== shiftId
    ) {
      throw new AppError({
        status: 502,
        code: "SHIFT_REPORT_SELECTION_MISMATCH",
        userMessage:
          "Не вдалося перевірити вибраний звіт."
      });
    }

    return apiOk(
      requestId,
      result,
      "Історію звітів отримано.",
      "SHIFT_REPORTS_READ"
    );
  } catch (error) {
    return apiFromError(requestId, error);
  }
}
