import type {
  AcceptTransferResult,
  IdempotentCommandResult
} from "@/lib/contracts/operational-commands";

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
  assertAllowedKeys,
  requireIdempotencyKey,
  requireJsonObject,
  requireString
} from "@/lib/server/operational-command-utils";
import {
  resolveTrustedTransferRoute
} from "@/lib/server/operational-config";
import {
  assertPermission
} from "@/lib/server/rbac";
import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import {
  assertTransferWriteEnabled
} from "@/lib/server/transfer-write-policy";

const ALLOWED_KEYS =
  new Set([
    "routeId",
    "transferId"
  ]);

type AdapterData = {
  idempotencyReplayed?: boolean;
  result?: AcceptTransferResult;
};

export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    assertPermission(
      context,
      "transfer:accept"
    );

        const idempotencyKey =
      requireIdempotencyKey(request);

    const body =
      await requireJsonObject(request);

    assertAllowedKeys(
      body,
      ALLOWED_KEYS,
      "acceptTransfer"
    );

    const routeId =
      requireString(
        body.routeId,
        "TRANSFER_ROUTE_REQUIRED",
        "Не вибрано маршрут переміщення."
      );

    const transferId =
      requireString(
        body.transferId,
        "TRANSFER_ID_REQUIRED",
        "Не вказано ID переміщення."
      );

        const transferRoute =
      await resolveTrustedTransferRoute(
        context,
        routeId,
        "INCOMING"
      );

    const annualRoute =
      await resolveAppsScriptAnnualRoute(context);

    const scopedTestAccept =
      process.env.PROFIN_ALT_2026_SINGLE_ACCEPT_ENABLED === "true" &&
      context.projectId === "demo-project" &&
      context.locationId === "alternatyva" &&
      context.activeYear === 2026 &&
      annualRoute.routeMode === "PRODUCTION" &&
      annualRoute.projectId === "demo-project" &&
      annualRoute.locationId === "alternatyva" &&
      annualRoute.year === 2026 &&
      annualRoute.spreadsheetId ===
        "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8" &&
      Boolean(annualRoute.adapterWebAppUrl?.trim()) &&
      routeId === "trf-demo-2026-main-alternatyva" &&
      transferRoute.projectId === "demo-project" &&
      transferRoute.year === 2026 &&
      transferRoute.status === "ACTIVE" &&
      transferRoute.sourceLocationId === "main" &&
      transferRoute.destinationLocationId === "alternatyva" &&
      transferRoute.sourceCode === "BAB" &&
      transferRoute.destinationCode === "ALT" &&
      transferRoute.sourceSpreadsheetId ===
        "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw" &&
      transferRoute.destinationSpreadsheetId ===
        "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8" &&
      transferId ===
        "TRF-BAB-ALT-20261105-022528-F35994" &&
      idempotencyKey ===
        "PROFIN-ALT-20261105-ACCEPT-ONCE-0001";

        if (!scopedTestAccept) {
      console.warn("ALT_ACCEPT_SCOPE_DENIED", {
        flagEnabled:
          process.env.PROFIN_ALT_2026_SINGLE_ACCEPT_ENABLED === "true",

        projectId: context.projectId,
        locationId: context.locationId,
        activeYear: context.activeYear,

        routeMode: annualRoute.routeMode,

        spreadsheetMatches:
          annualRoute.spreadsheetId ===
          "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8",

        routeIdMatches:
          routeId === "trf-demo-2026-main-alternatyva",

        transferIdMatches:
          transferId ===
          "TRF-BAB-ALT-20261105-022528-F35994",

        idempotencyKeyMatches:
          idempotencyKey ===
          "PROFIN-ALT-20261105-ACCEPT-ONCE-0001"
      });

      await assertTransferWriteEnabled(context);
    }

    const adapter =
      await callAppsScriptAdapter<
        {
          transferId: string;
          transferRoute: typeof transferRoute;
        },
        AdapterData
      >({
        requestId,
        command: "acceptTransfer",
        context,
        idempotencyKey,
        payload: {
          transferId,
          transferRoute
        }
      });

    const result =
      adapter.data?.result;

    if (!result?.transferId) {
      throw new AppError({
        status: 502,
        code: "EMPTY_ACCEPT_TRANSFER_RESULT",
        userMessage:
          "Доменне ядро не підтвердило приймання переміщення."
      });
    }

    const response:
      IdempotentCommandResult<AcceptTransferResult> = {
        result,
        idempotencyReplayed:
          adapter.data?.idempotencyReplayed === true
      };

    return apiOk(
      requestId,
      response,
      "Переміщення прийнято.",
      "TRANSFER_ACCEPTED"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}