
import type {
  AppsScriptPingData,
  AppsScriptPingPayload
} from "@/lib/contracts/apps-script-adapter";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseShiftDate(
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
      userMessage: "Оберіть коректну дату зміни."
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
      userMessage:
        "Дата зміни не належить активному обліковому року."
    });
  }

  return date;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "shift:read");

    const date = parseShiftDate(
      request,
      context.activeYear
    );

    const adapter = await callAppsScriptAdapter<
      AppsScriptPingPayload,
      AppsScriptPingData
    >({
      requestId,
      command: "ping",
      context,
      operationDate: date,
      idempotencyKey: null,
      signal: request.signal,
      payload: {
        source: "NEXTJS"
      }
    });

    if (adapter.data?.status !== "OK") {
      throw new AppError({
        status: 502,
        code: "SHIFT_ADAPTER_PING_INVALID",
        userMessage:
          "Адаптер не підтвердив доступність ядра."
      });
    }

    const response = apiOk(
      requestId,
      {
        date,
        locationId: context.locationId,
        activeYear: context.activeYear,
        transport: "OK" as const,
        snapshotAvailable: false as const,
        snapshotStatus:
          "UNVERIFIED_EXTERNAL_CONTRACT" as const,
        metrics: null,
        accounts: null,
        revision: null,
        canSubmit: false as const
      },
      "Зв'язок із Apps Script підтверджено. Контракт KPI ще не підключено.",
      "SHIFT_PREVIEW_PROBE_OK"
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
