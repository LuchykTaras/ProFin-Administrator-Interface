
import "server-only";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import { AppError } from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";


const PROFIN_PRODUCTION_WORKBOOKS_2026: Readonly<
  Record<string, string>
> = Object.freeze({
  main:
    "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw",

  alternatyva:
    "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8"
});


const PROFIN_TEST_WORKBOOKS_2026: Readonly<
  Record<string, string>
> = Object.freeze({
  "baburka-test":
    "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng",

  "alternatyva-test":
    "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY"
});


/**
 * Перевірка окремого Apps Script deployment.
 */
export async function assertDedicatedTransferAdapter(
  context: SessionContext
): Promise<void> {
  const route =
    await resolveAppsScriptAnnualRoute(context);

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
 * PATCH 14.1
 * Єдина політика міжфілійних переміщень.
 *
 * TEST і PRODUCTION незалежні.
 */
export async function transferWritesEnabled(
  context: SessionContext
): Promise<boolean> {
  const route =
    await resolveAppsScriptAnnualRoute(context);

  if (
    context.projectId !== "demo-project" ||
    context.activeYear !== 2026 ||
    route.projectId !== context.projectId ||
    route.locationId !== context.locationId ||
    route.year !== context.activeYear ||
    !route.adapterWebAppUrl?.trim()
  ) {
    return false;
  }

  if (route.routeMode === "TEST") {
    const expectedSpreadsheetId =
      PROFIN_TEST_WORKBOOKS_2026[
        context.locationId
      ];

    return (
      Boolean(expectedSpreadsheetId) &&
      route.spreadsheetId === expectedSpreadsheetId &&
      (
        route.status === "ACTIVE" ||
        route.status === "READY"
      ) &&
      process.env
        .PROFIN_TRANSFERS_TEST_WRITE_ENABLED === "true"
    );
  }

  if (route.routeMode === "PRODUCTION") {
    const expectedSpreadsheetId =
      PROFIN_PRODUCTION_WORKBOOKS_2026[
        context.locationId
      ];

    return (
      Boolean(expectedSpreadsheetId) &&
      route.spreadsheetId === expectedSpreadsheetId &&
      route.status === "ACTIVE" &&
      process.env
        .PROFIN_TRANSFERS_PRODUCTION_WRITE_ENABLED === "true"
    );
  }

  return false;
}


/**
 * Захист запису переміщень.
 */
export async function assertTransferWriteEnabled(
  context: SessionContext
): Promise<void> {
  const enabled =
    await transferWritesEnabled(context);

  if (!enabled) {
    throw new AppError({
      status: 503,
      code: "TRANSFER_WRITES_DISABLED",
      userMessage:
        "Запис переміщень вимкнений або маршрут не пройшов перевірку."
    });
  }
}
