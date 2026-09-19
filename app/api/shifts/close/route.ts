import type {
  CloseShiftResult,
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
  optionalString,
  requireFiniteNumber,
  requireIdempotencyKey,
  requireJsonObject
} from "@/lib/server/operational-command-utils";
import {
  resolveTrustedShiftPolicy
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
    "actualCash",
    "comment"
  ]);

type AdapterData = {
  idempotencyReplayed?: boolean;
  result?: CloseShiftResult;
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
      "shift:close"
    );

    const idempotencyKey =
      requireIdempotencyKey(request);

    const body =
      await requireJsonObject(request);

    assertAllowedKeys(
      body,
      ALLOWED_KEYS,
      "closeShift"
    );

    const actualCash =
      requireFiniteNumber(
        body.actualCash,
        "INVALID_ACTUAL_CASH",
        "Фактичний залишок каси має бути числом."
      );

    if (actualCash < 0) {
      throw new AppError({
        status: 400,
        code: "NEGATIVE_ACTUAL_CASH",
        userMessage:
          "Фактичний залишок каси не може бути від’ємним."
      });
    }

    const comment =
      optionalString(
        body.comment,
        2000
      );

    const shiftPolicy =
      await resolveTrustedShiftPolicy(
        context
      );

    const adapter =
      await callAppsScriptAdapter<
        {
          actualCash: number;
          comment: string | null;
          shiftPolicy: typeof shiftPolicy;
        },
        AdapterData
      >({
        requestId,
        command: "closeShift",
        context,
        idempotencyKey,
        payload: {
          actualCash,
          comment,
          shiftPolicy
        }
      });

    const result =
      adapter.data?.result;

    if (!result?.shiftId) {
      throw new AppError({
        status: 502,
        code: "EMPTY_CLOSE_SHIFT_RESULT",
        userMessage:
          "Доменне ядро не підтвердило закриття зміни."
      });
    }

    const response:
      IdempotentCommandResult<CloseShiftResult> = {
        result,
        idempotencyReplayed:
          adapter.data?.idempotencyReplayed === true
      };

    return apiOk(
      requestId,
      response,
      "Зміну зафіксовано.",
      "SHIFT_CLOSED"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}