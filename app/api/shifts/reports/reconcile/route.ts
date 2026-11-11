
import { createHash } from "node:crypto";

import {
  isShiftReportIdForDate
} from "@/lib/contracts/shift-report-ids";

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
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";

import {
  requireR3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";

import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReconcileResponse = {
  result?: {
    verified?: boolean;
    readOnly?: boolean;
    writesPerformed?: boolean;
    idempotencyReplayed?: boolean;
    reportId?: string;
    date?: string;
    idempotencyKey?: string;
    payloadSha256?: string;
    archiveRows?: {
      reports?: number;
      details?: number;
      kpi?: number;
    };
  };
};

function reject(
  status: number,
  code: string,
  message: string
): never {
  throw new AppError({
    status,
    code,
    userMessage: message,
    retryable: false
  });
}

function noStore(response: Response): Response {
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

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "shift:read");

    if (
      context.role !== "OWNER" &&
      context.role !== "SENIOR_ADMIN"
    ) {
      reject(
        403,
        "SHIFT_RECONCILE_ROLE_DENIED",
        "Недостатньо прав."
      );
    }

    const url = new URL(request.url);

    if (
      url.search ||
      request.headers.get("origin") !== url.origin
    ) {
      reject(
        403,
        "SHIFT_RECONCILE_CSRF_DENIED",
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
        "SHIFT_RECONCILE_JSON_REQUIRED",
        "Потрібен JSON."
      );
    }

    const key = request.headers
      .get("idempotency-key")
      ?.trim() ?? "";

    if (
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
        .test(key)
    ) {
      reject(
        400,
        "SHIFT_RECONCILE_UUID_INVALID",
        "Некоректний UUID."
      );
    }

    const raw = await request.text();

    if (!raw || raw.length > 32768) {
      reject(
        400,
        "SHIFT_RECONCILE_BODY_INVALID",
        "Некоректний розмір звіту."
      );
    }

    let input: unknown;

    try {
      input = JSON.parse(raw);
    } catch {
      reject(
        400,
        "SHIFT_RECONCILE_JSON_INVALID",
        "Некоректний JSON."
      );
    }

    const report =
      parseOfficialShiftSubmission(input);

    if (
      Number(report.date.slice(0, 4)) !==
      context.activeYear
    ) {
      reject(
        409,
        "SHIFT_RECONCILE_YEAR_MISMATCH",
        "Невідповідний обліковий рік."
      );
    }

    if (
      process.env
        .PROFIN_R3_BAB_ACL_BRIDGE_ENABLED !== "true" ||
      process.env
        .PROFIN_R3_BAB_FINANCIAL_READ_ENABLED !== "true"
    ) {
      reject(
        403,
        "SHIFT_RECONCILE_READ_DISABLED",
        "Фінансовий шлюз вимкнено."
      );
    }

    const identity =
      await requireR3BabVerifiedIdentity(
        context,
        report.date
      );

    const payloadSha256 = createHash("sha256")
      .update(JSON.stringify(report), "utf8")
      .digest("hex");

    const response = await callAppsScriptAdapter<
      {
        report: typeof report;
        identity: typeof identity;
        payloadSha256: string;
      },
      ReconcileResponse
    >({
      requestId,
      command: "reconcileShiftReport",
      context,
      operationDate: report.date,
      idempotencyKey: key,
      payload: {
        report,
        identity,
        payloadSha256
      }
    });

    const result = response.data?.result;

    const expectedReportId =
      `SHIFT-${report.date.replace(/-/g, "")}`;

    const verified =
      result?.verified === true &&
      result.readOnly === true &&
      result.writesPerformed === false &&
      result.idempotencyReplayed === true &&
      isShiftReportIdForDate(
  result.reportId,
  report.date
) &&
      result.date === report.date &&
      result.idempotencyKey?.toLowerCase() ===
        key.toLowerCase() &&
      result.payloadSha256 === payloadSha256 &&
      result.archiveRows?.reports === 1 &&
      result.archiveRows?.details === 4 &&
      result.archiveRows?.kpi === 7;

    if (!verified) {
      reject(
        409,
        "SHIFT_RECONCILIATION_UNRESOLVED",
        "Архівний запис не підтверджено. " +
          "Не подавайте звіт повторно."
      );
    }

    return noStore(
      apiOk(
        requestId,
        {
          decision: "SUBMITTED",
          reportId: result.reportId,
          archiveVerified: true,
          idempotencyReplayed: true,
          writePerformed: false
        },
        "Звіт підтверджено в архіві.",
        "SHIFT_RECONCILIATION_CONFIRMED"
      )
    );
  } catch (error) {
    const normalized =
      error instanceof ShiftContractError
        ? new AppError({
            status: 400,
            code: "SHIFT_RECONCILE_INVALID_CONTRACT",
            userMessage: error.message,
            retryable: false
          })
        : error;

    return noStore(
      apiFromError(requestId, normalized)
    );
  }
}
