import {
  parseOfficialShiftSubmission,
  ShiftContractError
} from "@/lib/contracts/shift-official-submit";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  AppError
} from "@/lib/server/errors";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";

import type {
  SessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACT_VERSION =
  "PROFIN_SHIFT_R3_00_ISOLATED_V1";

function assertOfficialReportAccess(
  context: SessionContext
): void {
  assertPermission(
    context,
    "shift:close"
  );

  if (
    context.role !== "OWNER" &&
    context.role !== "SENIOR_ADMIN"
  ) {
    throw new AppError({
      status: 403,
      code: "SHIFT_REPORT_ROLE_FORBIDDEN",
      userMessage:
        "Недостатньо прав для подання звіту."
    });
  }
}

function noStore(
  response: Response
): Response {
  response.headers.set(
    "Cache-Control",
    "private, no-store"
  );

  return response;
}

export async function GET(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    assertOfficialReportAccess(
      context
    );

    return noStore(
      apiOk(
        requestId,
        {
          version: CONTRACT_VERSION,
          status: "BLOCKED",
          submissionEnabled: false,
          snapshotVerified: false,
          financialWriteEnabled: false,
          legacyCloseShiftUnchanged: true
        },
        "Новий маршрут R3 доступний. " +
        "Офіційне подання очікує перевірки контракту.",
        "SHIFT_R3_ROUTE_READY"
      )
    );
  } catch (error) {
    return noStore(
      apiFromError(
        requestId,
        error
      )
    );
  }
}

export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    assertOfficialReportAccess(
      context
    );

    const contentType =
      request.headers.get("content-type") ?? "";

    if (
      !/^application\/json(?:\s*;|$)/i.test(contentType)
    ) {
      throw new AppError({
        status: 415,
        code: "SHIFT_R3_JSON_REQUIRED",
        userMessage:
          "Потрібен JSON-запит."
      });
    }

    const idempotencyKey =
      request.headers.get("idempotency-key");

    if (
      !idempotencyKey ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(
        idempotencyKey
      )
    ) {
      throw new AppError({
        status: 400,
        code: "SHIFT_R3_IDEMPOTENCY_KEY_REQUIRED",
        userMessage:
          "Відсутній коректний ключ ідемпотентності."
      });
    }

    const rawBody = await request.text();

    if (
      rawBody.length === 0 ||
      rawBody.length > 32768
    ) {
      throw new AppError({
        status: 400,
        code: "SHIFT_R3_INVALID_BODY_SIZE",
        userMessage:
          "Некоректний розмір запиту."
      });
    }

    let input: unknown;

    try {
      input = JSON.parse(rawBody);
    } catch {
      throw new AppError({
        status: 400,
        code: "SHIFT_R3_INVALID_JSON",
        userMessage:
          "Некоректний JSON."
      });
    }

    const submission =
      parseOfficialShiftSubmission(input);

    if (
      Number(submission.date.slice(0, 4)) !==
      context.activeYear
    ) {
      throw new AppError({
        status: 409,
        code: "SHIFT_R3_YEAR_MISMATCH",
        userMessage:
          "Дата не належить активному обліковому року."
      });
    }

    throw new AppError({
      status: 409,
      code: "SHIFT_R3_SUBMIT_NOT_VERIFIED",
      userMessage:
        "Офіційне подання ще не активовано. " +
        "Необхідна перевірка 7 KPI, " +
        "4 рахунків, revision та архівування.",
      retryable: false
    });
    } catch (error) {
    const normalizedError =
      error instanceof ShiftContractError
        ? new AppError({
            status: 400,
            code: "SHIFT_R3_INVALID_CONTRACT",
            userMessage: error.message,
            retryable: false
          })
        : error;

    return noStore(
      apiFromError(
        requestId,
        normalizedError
      )
    );
  }
}