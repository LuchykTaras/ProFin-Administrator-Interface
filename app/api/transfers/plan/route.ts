import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  assertDedicatedTransferAdapter
} from "@/lib/server/transfer-write-policy";

import {
  resolveTrustedTransferRoute
} from "@/lib/server/operational-config";

import {
  assertAllowedKeys,
  requireDateOnly,
  requireJsonObject,
  requirePositiveNumber,
  requireString
} from "@/lib/server/operational-command-utils";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";

import type {
  TransferPlanResult
} from "@/lib/contracts/operational-commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "routeId",
  "sourceLotId",
  "quantity",
  "operationDate"
]);

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "transfer:create");

    await assertDedicatedTransferAdapter(context);

    const body = await requireJsonObject(request);

    assertAllowedKeys(
      body,
      ALLOWED_KEYS,
      "previewTransfer"
    );

    const routeId = requireString(
      body.routeId,
      "TRANSFER_ROUTE_REQUIRED",
      "Не вибрано маршрут передачі."
    );

    const sourceLotId = requireString(
      body.sourceLotId,
      "SOURCE_LOT_ID_REQUIRED",
      "Не вибрано партію."
    );

    const quantity = requirePositiveNumber(
      body.quantity,
      "INVALID_TRANSFER_QUANTITY",
      "Некоректна кількість."
    );

    const operationDate = requireDateOnly(
      body.operationDate
    );

    const transferRoute = await resolveTrustedTransferRoute(
      context,
      routeId,
      "OUTGOING"
    );

    const response = await callAppsScriptAdapter<
      {
        transferRoute: typeof transferRoute;
        sourceLotId: string;
        quantity: number;
        operationDate: string;
      },
      {
        result?: TransferPlanResult;
      }
    >({
      requestId,
      command: "previewTransfer",
      context,
      operationDate,
      payload: {
        transferRoute,
        sourceLotId,
        quantity,
        operationDate
      }
    });

    const plan = response.data?.result;

    if (
      !plan ||
      plan.sourceLotId !== sourceLotId ||
      plan.quantity !== quantity ||
      !Number.isFinite(plan.sourceBalanceBefore) ||
      plan.sourceBalanceBefore < quantity ||
      plan.operationDate !== operationDate
    ) {
      throw new AppError({
        status: 502,
        code: "INVALID_TRANSFER_PLAN",
        userMessage:
          "Ядро повернуло некоректний план переміщення."
      });
    }

    return apiOk(
      requestId,
      plan,
      "План перевірено без запису.",
      "TRANSFER_PLAN_OK"
    );
  } catch (error) {
    return apiFromError(requestId, error);
  }
}