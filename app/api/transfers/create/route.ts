import type {
  CreateTransferResult,
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
  requireDateOnly,
  requireIdempotencyKey,
  requireJsonObject,
  requirePositiveNumber,
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
    "sourceLotId",
    "quantity",
    "operationDate"
  ]);

type AdapterData = {
  idempotencyReplayed?: boolean;
  result?: CreateTransferResult;
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
      "transfer:create"
    );

    const idempotencyKey =
      requireIdempotencyKey(request);

    const body =
      await requireJsonObject(request);

    assertAllowedKeys(
      body,
      ALLOWED_KEYS,
      "createTransfer"
    );

    const routeId =
      requireString(
        body.routeId,
        "TRANSFER_ROUTE_REQUIRED",
        "Не вибрано маршрут переміщення."
      );

    const sourceLotId =
      requireString(
        body.sourceLotId,
        "SOURCE_LOT_ID_REQUIRED",
        "Не вибрано партію для переміщення."
      );

    const quantity =
      requirePositiveNumber(
        body.quantity,
        "INVALID_TRANSFER_QUANTITY",
        "Кількість переміщення має бути більшою за нуль."
      );

    const operationDate =
      requireDateOnly(
        body.operationDate
      );

    const transferRoute =
      await resolveTrustedTransferRoute(
        context,
        routeId,
        "OUTGOING"
      );

    const adapter =
      await callAppsScriptAdapter<
        {
          sourceLotId: string;
          quantity: number;
          operationDate: string;
          transferRoute: typeof transferRoute;
        },
        AdapterData
      >({
        requestId,
        command: "createTransfer",
        context,
        operationDate,
        idempotencyKey,
        payload: {
          sourceLotId,
          quantity,
          operationDate,
          transferRoute
        }
      });

    const result =
      adapter.data?.result;

    if (!result?.transferId) {
      throw new AppError({
        status: 502,
        code: "EMPTY_CREATE_TRANSFER_RESULT",
        userMessage:
          "Доменне ядро не підтвердило переміщення."
      });
    }

    const response:
      IdempotentCommandResult<CreateTransferResult> = {
        result,
        idempotencyReplayed:
          adapter.data?.idempotencyReplayed === true
      };

    return apiOk(
      requestId,
      response,
      "Переміщення створено.",
      "TRANSFER_CREATED"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}