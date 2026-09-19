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