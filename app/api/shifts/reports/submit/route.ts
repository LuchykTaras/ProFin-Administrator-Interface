
import {
  parseOfficialShiftSubmission,
  ShiftContractError
} from "@/lib/contracts/shift-official-submit";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";

import type {
  SessionContext
} from "@/lib/server/session";

import {
  requireR3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";

import {
  requireShiftGoogleToken
} from "@/lib/server/r3-shift-google-proof";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reject(
  status: number,
  code: string,
  userMessage: string
): never {
  throw new AppError({
    status,
    code,
    userMessage,
    retryable: false
  });
}

function noStore<T extends Response>(
  response: T
): T {
  response.headers.set(
    "Cache-Control",
    "private, no-store"
  );

  response.headers.set(
    "Referrer-Policy",
    "no-referrer"
  );

  return response;
}

function assertAccess(
  context: SessionContext
): void {
  assertPermission(context, "shift:close");

  if (
    context.role !== "OWNER" &&
    context.role !== "SENIOR_ADMIN"
  ) {
    reject(
      403,
      "SHIFT_REPORT_ROLE_FORBIDDEN",
      "Недостатньо прав для подання."
    );
  }
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertAccess(context);

    const enabled =
      process.env.PROFIN_SHIFT_SUBMIT_ENABLED === "true";

    return noStore(
      apiOk(
        requestId,
        {
          version: "PROFIN_SHIFT_R3_05_04_GATEWAY_V1",
          status: enabled
            ? "SERVER_GATE_ENABLED"
            : "BLOCKED",
          submissionEnabled: enabled,
          financialWriteEnabled: null,
          legacyCloseShiftUnchanged: true
        },
        "Стан шлюзу подання.",
        "SHIFT_R3_ROUTE_READY"
      )
    );
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}

type WriterResponse = {
  result?: {
    ok?: boolean;
    reportId?: string;
    submittedAt?: string;
    status?: string;
    writesPerformed?: boolean;
    idempotencyReplayed?: boolean;
    archiveRows?: {
      reports?: number;
      details?: number;
      kpi?: number;
    };
  };
};

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertAccess(context);

    const url = new URL(request.url);

    if (
      url.search ||
      request.headers.get("origin") !== url.origin
    ) {
      reject(
        403,
        "SHIFT_SUBMIT_CSRF_DENIED",
        "Недозволене джерело запиту."
      );
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    if (contentType !== "application/json") {
      reject(
        415,
        "SHIFT_SUBMIT_JSON_REQUIRED",
        "Потрібен JSON-запит."
      );
    }

    const idempotencyKey =
      request.headers.get("idempotency-key") || "";

    if (
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
        .test(idempotencyKey)
    ) {
      reject(
        400,
        "SHIFT_SUBMIT_IDEMPOTENCY_INVALID",
        "Некоректний ключ повторного запиту."
      );
    }

    const raw = await request.text();

    if (!raw || raw.length > 32768) {
      reject(
        400,
        "SHIFT_SUBMIT_BODY_SIZE",
        "Некоректний розмір звіту."
      );
    }

    let unknownBody: unknown;

    try {
      unknownBody = JSON.parse(raw);
    } catch {
      reject(
        400,
        "SHIFT_SUBMIT_INVALID_JSON",
        "Некоректний JSON."
      );
    }

    const report =
      parseOfficialShiftSubmission(unknownBody);

    if (
      Number(report.date.slice(0, 4)) !==
      context.activeYear
    ) {
      reject(
        409,
        "SHIFT_SUBMIT_YEAR_MISMATCH",
        "Дата не відповідає обліковому року."
      );
    }

    if (
      process.env.PROFIN_SHIFT_SUBMIT_ENABLED !==
      "true"
    ) {
      reject(
        403,
        "SHIFT_SUBMIT_DISABLED",
        "Запис фінансових звітів ще не активовано."
      );
    }

    if (
      process.env.PROFIN_R3_BAB_ACL_BRIDGE_ENABLED !==
        "true" ||
      process.env.PROFIN_R3_BAB_FINANCIAL_READ_ENABLED !==
        "true"
    ) {
      reject(
        403,
        "SHIFT_SUBMIT_BRIDGE_DISABLED",
        "Фінансовий шлюз недоступний."
      );
    }

    const identity =
      await requireR3BabVerifiedIdentity(
        context,
        report.date
      );

    const proof = await requireShiftGoogleToken(
      request,
      context,
      report.date,
      identity
    );

    if (
      proof.tokenVerifiedForRequest !== true ||
      proof.googleSubjectMatched !== true
    ) {
      reject(
        403,
        "SHIFT_SUBMIT_GOOGLE_REQUIRED",
        "Google Identity не підтверджено."
      );
    }

    const adapter = await callAppsScriptAdapter<
      {
        report: typeof report;
        identity: typeof identity;
      },
      WriterResponse
    >({
      requestId,
      command: "submitShiftReport",
      context,
      idempotencyKey,
      operationDate: report.date,
      payload: {
        report,
        identity
      }
    });

    const result = adapter.data?.result;

    const expectedId =
      `SHIFT-${report.date.replace(/-/g, "")}`;

    if (
      !result ||
      result.ok !== true ||
      result.reportId !== expectedId ||
      !result.submittedAt ||
      !["Подано", "Потребує уваги"].includes(
        result.status || ""
      ) ||
      result.archiveRows?.reports !== 1 ||
      result.archiveRows?.details !== 4 ||
      result.archiveRows?.kpi !== 7 ||
      !(
        result.writesPerformed === true ||
        result.idempotencyReplayed === true
      )
    ) {
      reject(
        502,
        "SHIFT_SUBMIT_UNVERIFIED_ARCHIVE",
        "Не підтверджено запис в архіві. " +
        "Не повторюйте з іншим ключем."
      );
    }

    return noStore(
      apiOk(
        requestId,
        {
          decision: "SUBMITTED",
          reportId: result.reportId,
          submittedAt: result.submittedAt,
          status: result.status,
          idempotencyReplayed:
            result.idempotencyReplayed === true,
          archiveVerified: true,
          writePerformed:
            result.writesPerformed === true
        },
        "Звіт записано до архіву.",
        "SHIFT_REPORT_SUBMITTED"
      )
    );
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
