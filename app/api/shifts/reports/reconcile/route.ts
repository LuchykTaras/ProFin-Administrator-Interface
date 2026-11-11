import { apiFromError, apiOk, getRequestId } from "@/lib/server/api";
import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";
import { requireR3BabVerifiedIdentity } from "@/lib/server/r3-bab-identity";
import { callAppsScriptAdapter } from "@/lib/server/apps-script-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Reconciliation = {
  result?: {
    verified?: boolean;
    readOnly?: boolean;
    sameRequest?: boolean;
    payloadMatched?: boolean;
    archiveVerified?: boolean;
    authorizationVerified?: boolean;
    date?: string;
    reportId?: string;
    idempotencyKey?: string;
    payloadSha256?: string;
    archiveRows?: {
      reports?: number;
      details?: number;
      kpi?: number;
    };
  };
};

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function fail(status: number, code: string, message: string): never {
  throw new AppError({
    status,
    code,
    userMessage: message,
    retryable: false
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const url = new URL(request.url);
    const query = url.searchParams;
    const date = query.get("date") || "";
    const idempotencyKey = query.get("idempotencyKey") || "";
    const payloadSha256 = query.get("payloadSha256") || "";

    if (
      [...query.keys()].some(key =>
        !["date", "idempotencyKey", "payloadSha256"].includes(key)
      ) ||
      query.getAll("date").length !== 1 ||
      query.getAll("idempotencyKey").length !== 1 ||
      query.getAll("payloadSha256").length !== 1 ||
      !/^2026-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date + "T00:00:00.000Z")) ||
      new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) !== date ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(idempotencyKey) ||
      !/^[a-f0-9]{64}$/.test(payloadSha256)
    ) {
      fail(400, "SHIFT_RECONCILE_QUERY_INVALID", "Некоректні параметри звірки.");
    }

    const context = await requireSessionContext();
    assertPermission(context, "shift:read");

    if (context.role !== "OWNER" && context.role !== "SENIOR_ADMIN") {
      fail(403, "SHIFT_RECONCILE_ROLE_DENIED", "Недостатньо прав для звірки.");
    }

    if (Number(date.slice(0, 4)) !== context.activeYear) {
      fail(409, "SHIFT_RECONCILE_YEAR_MISMATCH", "Невідповідний обліковий рік.");
    }

    if (
      process.env.PROFIN_R3_BAB_ACL_BRIDGE_ENABLED !== "true" ||
      process.env.PROFIN_R3_BAB_FINANCIAL_READ_ENABLED !== "true"
    ) {
      fail(403, "SHIFT_RECONCILE_READ_DISABLED", "Фінансовий доступ вимкнено.");
    }

    const identity = await requireR3BabVerifiedIdentity(context, date);

    const response = await callAppsScriptAdapter<
      {
        date: string;
        idempotencyKey: string;
        payloadSha256: string;
        identity: typeof identity;
      },
      Reconciliation
    >({
      requestId,
      command: "reconcileShiftReport",
      context,
      operationDate: date,
      payload: { date, idempotencyKey, payloadSha256, identity }
    });

    const result = response.data?.result;
    const expectedId = "SHIFT-" + date.replace(/-/g, "");

    const confirmed =
      result?.verified === true &&
      result.readOnly === true &&
      result.sameRequest === true &&
      result.payloadMatched === true &&
      result.archiveVerified === true &&
      result.authorizationVerified === true &&
      result.date === date &&
      result.reportId === expectedId &&
      result.idempotencyKey?.toLowerCase() === idempotencyKey.toLowerCase() &&
      result.payloadSha256 === payloadSha256 &&
      result.archiveRows?.reports === 1 &&
      result.archiveRows?.details === 4 &&
      result.archiveRows?.kpi === 7;

    if (!confirmed) {
      return noStore(
        apiOk(
          requestId,
          {
            decision: "UNRESOLVED" as const,
            date,
            archiveVerified: false,
            writePerformed: false
          },
          "Запис не підтверджено. Не повторюйте подання.",
          "SHIFT_RECONCILIATION_UNRESOLVED"
        )
      );
    }

    return noStore(
      apiOk(
        requestId,
        {
          decision: "SUBMITTED" as const,
          date,
          reportId: expectedId,
          idempotencyReplayed: true,
          archiveVerified: true,
          writePerformed: false
        },
        "Архівний запис звірено без повторного запису.",
        "SHIFT_RECONCILIATION_CONFIRMED"
      )
    );
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}
