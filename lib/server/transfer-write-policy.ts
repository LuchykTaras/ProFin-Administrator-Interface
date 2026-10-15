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
  if (isAlt2026TransferWriteBlocked(context)) {
    return false;
  }

  const route = await resolveAppsScriptAnnualRoute(context);

  if (!route.adapterWebAppUrl?.trim()) {
    return false;
  }

  if (route.routeMode === "TEST") {
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