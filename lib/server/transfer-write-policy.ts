import "server-only";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import { AppError } from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";

/**
 * PATCH 55.9.6.R2.1
 *
 * Тимчасове блокування всіх команд
 * запису переміщень для ALT 2026.
 *
 * Бабурку не зачіпаємо.
 */
export function isAlt2026TransferWriteBlocked(
  context: SessionContext
): boolean {
  return (
    context.projectId === "demo-project" &&
    context.locationId === "alternatyva" &&
    context.activeYear === 2026
  );
}

/**
 * Кожна філія повинна мати власний
 * зареєстрований Apps Script deployment.
 */
export async function assertDedicatedTransferAdapter(
  context: SessionContext
): Promise<void> {
  const route = await resolveAppsScriptAnnualRoute(context);

  if (!route.adapterWebAppUrl?.trim()) {
    throw new AppError({
      status: 503,
      code: "TRANSFER_ROUTE_ADAPTER_NOT_REGISTERED",
      userMessage:
        "Для цієї філії не зареєстровано власний Apps Script вебадаптер."
    });
  }
}

/**
 * TEST і PRODUCTION мають незалежні дозволи.
 */
export async function transferWritesEnabled(
  context: SessionContext
): Promise<boolean> {
    const route = await resolveAppsScriptAnnualRoute(context);

  // PATCH 61.60 - TEST route allowed.
  // ALT 2026 PRODUCTION remains blocked.
  if (
    isAlt2026TransferWriteBlocked(context) &&
    route.routeMode !== "TEST"
  ) {
    return false;
  }

  if (!route.adapterWebAppUrl?.trim()) {
    return false;
  }

  // PATCH 61.62
// Explicitly pinned TEST warehouse pair.

if (route.routeMode === "TEST") {
  const allowedTestWorkbooks: Record<string, string> = {
    "baburka-test":
      "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng",

    "alternatyva-test":
      "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY"
  };

  const expectedSpreadsheetId =
    allowedTestWorkbooks[context.locationId];

  if (
    context.projectId !== "demo-project" ||
    context.activeYear !== 2026 ||
    route.year !== 2026 ||
    !expectedSpreadsheetId ||
    route.spreadsheetId !== expectedSpreadsheetId ||
    route.locationId !== context.locationId ||
    route.projectId !== context.projectId
  ) {
    return false;
  }

  return (
    process.env.PROFIN_TRANSFERS_TEST_WRITE_ENABLED === "true"
  );
}

  return (
    route.routeMode === "PRODUCTION" &&
    process.env.PROFIN_TRANSFERS_PRODUCTION_WRITE_ENABLED === "true"
  );
}

/**
 * Забороняє запис, доки відповідний
 * режим явно не активовано.
 */
export async function assertTransferWriteEnabled(
  context: SessionContext
): Promise<void> {
  const enabled = await transferWritesEnabled(context);

  if (!enabled) {
    throw new AppError({
      status: 503,
      code: "TRANSFER_WRITES_DISABLED",
      userMessage:
        "Запис переміщень вимкнений. Спочатку необхідна TEST-перевірка."
    });
  }
}