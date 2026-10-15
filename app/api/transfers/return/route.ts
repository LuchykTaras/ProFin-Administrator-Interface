import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  resolveTrustedTransferRoute
} from "@/lib/server/operational-config";

import {
  assertTransferWriteEnabled
} from "@/lib/server/transfer-write-policy";

import {
  assertAllowedKeys,
  requireIdempotencyKey,
  requireJsonObject,
  requireString
} from "@/lib/server/operational-command-utils";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";

import type {
  IdempotentCommandResult,
  ReturnTransferResult
} from "@/lib/contracts/operational-commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "routeId",
  "transferId"
]);

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "transfer:accept");

    const idempotencyKey = requireIdempotencyKey(request);

    await assertTransferWriteEnabled(context);

    const body = await requireJsonObject(request);

    assertAllowedKeys(
      body,
      ALLOWED_KEYS,
      "returnTransfer"
    );

    const routeId = requireString(
      body.routeId,
      "TRANSFER_ROUTE_REQUIRED",
      "Не вибрано маршрут."
    );

    const transferId = requireString(
      body.transferId,
      "TRANSFER_ID_REQUIRED",
      "Не вказано ID переміщення."
    );

    const transferRoute = await resolveTrustedTransferRoute(
      context,
      routeId,
      "INCOMING"
    );

    const response = await callAppsScriptAdapter<
      {
        transferId: string;
        transferRoute: typeof transferRoute;
      },
      {
        result?: ReturnTransferResult;
        idempotencyReplayed?: boolean;
      }
    >({
      requestId,
      command: "returnTransfer",
      context,
      idempotencyKey,
      payload: {
        transferId,
        transferRoute
      }
    });

    const result = response.data?.result;

    if (!result || result.transferId !== transferId) {
      throw new AppError({
        status: 502,
        code: "RETURN_NOT_CONFIRMED",
        userMessage:
          "Ядро не підтвердило повернення."
      });
    }

    const data: IdempotentCommandResult<ReturnTransferResult> = {
      result,
      idempotencyReplayed:
        response.data?.idempotencyReplayed === true
    };

    return apiOk(
      requestId,
      data,
      "Передачу повернуто відправнику.",
      "TRANSFER_RETURNED"
    );
  } catch (error) {
    return apiFromError(requestId, error);
  }
}