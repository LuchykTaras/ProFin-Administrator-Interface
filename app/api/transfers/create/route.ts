import type {
  CreateTransferResult,
  IdempotentCommandResult
} from "@/lib/contracts/operational-commands";

import {
  assertTransferWriteEnabled
} from "@/lib/server/transfer-write-policy";

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

const ALLOWED_KEYS = new Set([
  "routeId",
  "sourceLotId",
  "quantity",
  "operationDate",
  "expectedSourceBalance"
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

    // R3.5 — createTransfer-only key contract.
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/.test(
        idempotencyKey
      )
    ) {
      throw new AppError({
        status: 400,
        code: "INVALID_TRANSFER_IDEMPOTENCY_KEY",
        userMessage:
          "Некоректний ключ захисту переміщення."
      });
    }

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

    const operationDate = requireDateOnly(
  body.operationDate
);

const expectedSourceBalance = Number(
  body.expectedSourceBalance
);



if (
  !Number.isFinite(expectedSourceBalance) ||
  expectedSourceBalance < quantity
) {
  throw new AppError({
    status: 409,
    code: "TRANSFER_PLAN_REQUIRED",
    userMessage:
      "Спочатку перевірте план переміщення."
  });
}

const transferRoute =
  await resolveTrustedTransferRoute(
    context,
    routeId,
    "OUTGOING"
  );

  const scopedAltReverseWrite =
  process.env.PROFIN_ALT_2026_SINGLE_REVERSE_ENABLED === "true" &&
  context.projectId === "demo-project" &&
  context.locationId === "alternatyva" &&
  context.activeYear === 2026 &&
  routeId === "trf-demo-2026-alternatyva-main" &&
  sourceLotId === "TRF-BAB-ALT-20261105-022528-F35994-LOT-IN" &&
  quantity === 1 &&
  expectedSourceBalance === 1 &&
  operationDate === "2026-11-05" &&
  idempotencyKey === "PROFIN-ALT-BAB-20261105-ONCE-0001" &&
  transferRoute.status === "ACTIVE" &&
  transferRoute.sourceLocationId === "alternatyva" &&
  transferRoute.destinationLocationId === "main" &&
  transferRoute.sourceSpreadsheetId ===
    "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8" &&
  transferRoute.destinationSpreadsheetId ===
    "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw";

const approvedTestLotId =
  process.env.PROFIN_BAB_2026_TEST_LOT_ID?.trim();

const scopedTestWrite =
  process.env.PROFIN_BAB_2026_SINGLE_TRANSFER_ENABLED === "true" &&
  Boolean(approvedTestLotId) &&
  context.projectId === "demo-project" &&
  context.locationId === "main" &&
  context.activeYear === 2026 &&
  routeId === "trf-demo-2026-main-alternatyva" &&
  transferRoute.projectId === "demo-project" &&
  transferRoute.year === 2026 &&
  transferRoute.status === "ACTIVE" &&
  transferRoute.sourceLocationId === "main" &&
  transferRoute.sourceCode === "BAB" &&
  transferRoute.destinationLocationId === "alternatyva" &&
  transferRoute.destinationCode === "ALT" &&
  transferRoute.sourceSpreadsheetId ===
    "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw" &&
  transferRoute.destinationSpreadsheetId ===
    "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8" &&
    sourceLotId === approvedTestLotId &&
  quantity === 1 &&
  expectedSourceBalance === 1 &&
  idempotencyKey ===
    "PROFIN-BAB-20261105-ONCE-0001";

if (!scopedTestWrite && !scopedAltReverseWrite) {
  await assertTransferWriteEnabled(context);
}

    const adapter =
  await callAppsScriptAdapter<
    {
      sourceLotId: string;
      quantity: number;
      operationDate: string;
      expectedSourceBalance: number;
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
        expectedSourceBalance,
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