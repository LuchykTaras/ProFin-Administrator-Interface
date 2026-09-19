import type {
  CancelOperationResult,
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
  assertPermission
} from "@/lib/server/rbac";
import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS =
  new Set([
    "operationId"
  ]);

type AdapterData = {
  idempotencyReplayed?: boolean;
  result?: CancelOperationResult;
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
      "cancellation:request"
    );

    const idempotencyKey =
      requireIdempotencyKey(request);

    const body =
      await requireJsonObject(request);

    assertAllowedKeys(
      body,
      ALLOWED_KEYS,
      "cancelOperation"
    );

    const operationId =
      requireString(
        body.operationId,
        "OPERATION_ID_REQUIRED",
        "Вкажіть точний ID операції."
      );

    const adapter =
      await callAppsScriptAdapter<
        {
          operationId: string;
        },
        AdapterData
      >({
        requestId,
        command: "cancelOperation",
        context,
        idempotencyKey,
        payload: {
          operationId
        }
      });

    const result =
      adapter.data?.result;

    if (!result?.operationId) {
      throw new AppError({
        status: 502,
        code: "EMPTY_CANCEL_OPERATION_RESULT",
        userMessage:
          "Доменне ядро не підтвердило скасування операції."
      });
    }

    const response:
      IdempotentCommandResult<CancelOperationResult> = {
        result,
        idempotencyReplayed:
          adapter.data?.idempotencyReplayed === true
      };

    return apiOk(
      requestId,
      response,
      "Операцію скасовано.",
      "OPERATION_CANCELLED"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}