import "server-only";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import { AppError } from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";

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
const PRODUCTION_2026_PINNED_WORKBOOKS: Record<string, string> = {
  main: "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw",
  alternatyva: "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8"
};

/**
 * TEST та PRODUCTION незалежні. Спільний production-дозвіл
 * використовується для Бабурки й Альтернативи без одноразових винятків.
 */
export async function transferWritesEnabled(
  context: SessionContext
): Promise<boolean> {
  const route = await resolveAppsScriptAnnualRoute(context);

  if (
    !route.adapterWebAppUrl?.trim() ||
    route.projectId !== context.projectId ||
    route.locationId !== context.locationId ||
    route.year !== context.activeYear
  ) {
    return false;
  }

  if (route.routeMode === "TEST") {
    const allowedTestWorkbooks: Record<string, string> = {
      "baburka-test": "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng",
      "alternatyva-test": "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY"
    };

    return (
      context.projectId === "demo-project" &&
      context.activeYear === 2026 &&
      route.spreadsheetId === allowedTestWorkbooks[context.locationId] &&
      process.env.PROFIN_TRANSFERS_TEST_WRITE_ENABLED === "true"
    );
  }

  if (route.routeMode !== "PRODUCTION" || route.status !== "ACTIVE") {
    return false;
  }

  if (
    context.projectId === "demo-project" &&
    context.activeYear === 2026
  ) {
    const pinnedId = PRODUCTION_2026_PINNED_WORKBOOKS[context.locationId];

    if (pinnedId && route.spreadsheetId !== pinnedId) {
      return false;
    }
  }

  return process.env.PROFIN_TRANSFERS_PRODUCTION_WRITE_ENABLED === "true";
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
        "Запис переміщень вимкнений або маршрут не пройшов перевірку."
    });
  }
}