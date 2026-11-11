
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
  requireR3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";

import {
  requireSessionContext
} from "@/lib/server/session";

import {
  SHIFT_ACCOUNT_NAMES,
  SHIFT_KPI_KEYS
} from "@/lib/contracts/shift-official-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "PROFIN_R3_03D_SECURE_READ_V1";

type Mode = "ACL_CHECK" | "SNAPSHOT";

type ReadResponse = {
  result?: {
    authorized?: boolean;
    isOwner?: boolean;
    readOnly?: boolean;
    canSubmit?: boolean;
    snapshot?: unknown;
  };
};

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function paramsFor(
  request: Request
): { date: string; mode: Mode } {
  const params = new URL(request.url).searchParams;
  const dates = params.getAll("date");
  const modes = params.getAll("mode");

  if (
    dates.length !== 1 ||
    modes.length !== 1 ||
    [...params.keys()].some(
      key => key !== "date" && key !== "mode"
    ) ||
    !/^2026-\d{2}-\d{2}$/.test(dates[0]) ||
    (modes[0] !== "acl" && modes[0] !== "snapshot")
  ) {
    throw new AppError({
      status: 400,
      code: "R3_BAB_QUERY_INVALID",
      userMessage: "Invalid date or read mode."
    });
  }

  const parsed = new Date(
    `${dates[0]}T00:00:00.000Z`
  );

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dates[0]
  ) {
    throw new AppError({
      status: 400,
      code: "R3_BAB_DATE_INVALID",
      userMessage: "Invalid calendar date."
    });
  }

  return {
    date: dates[0],
    mode: modes[0] === "acl" ? "ACL_CHECK" : "SNAPSHOT"
  };
}

function invalidSnapshot(): AppError {
  return new AppError({
    status: 502,
    code: "R3_BAB_SNAPSHOT_CONTRACT_INVALID",
    userMessage:
      "Financial snapshot did not pass contract validation."
  });
}

function validateSnapshot(value: unknown, date: string) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidSnapshot();
  }

  const s = value as Record<string, unknown>;

  if (
    s.date !== date ||
    typeof s.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(s.revision) ||
    !Array.isArray(s.metrics) ||
    s.metrics.length !== SHIFT_KPI_KEYS.length ||
    !Array.isArray(s.accounts) ||
    s.accounts.length !== SHIFT_ACCOUNT_NAMES.length
  ) {
    throw invalidSnapshot();
  }

  const metricKeys = new Set<string>();

  for (const entry of s.metrics) {
    if (
      !entry ||
      typeof entry !== "object"
    ) {
      throw invalidSnapshot();
    }

    const metric = entry as Record<string, unknown>;

    if (
      typeof metric.key !== "string" ||
      !SHIFT_KPI_KEYS.some(
        key => key === metric.key
      ) ||
      metricKeys.has(metric.key) ||
      typeof metric.auto !== "number" ||
      !Number.isFinite(metric.auto)
    ) {
      throw invalidSnapshot();
    }

    metricKeys.add(metric.key);
  }

  const accountNames = new Set<string>();

  for (const entry of s.accounts) {
    if (
      !entry ||
      typeof entry !== "object"
    ) {
      throw invalidSnapshot();
    }

    const account = entry as Record<string, unknown>;

    if (
      typeof account.name !== "string" ||
      !SHIFT_ACCOUNT_NAMES.some(
        name => name === account.name
      ) ||
      accountNames.has(account.name) ||
      ![
        "receipts",
        "payouts",
        "transferIn",
        "transferOut"
      ].every(
        name =>
          typeof account[name] === "number" &&
          Number.isFinite(account[name])
      ) ||
      !(
        account.opening === null ||
        (
          typeof account.opening === "number" &&
          Number.isFinite(account.opening)
        )
      )
    ) {
      throw invalidSnapshot();
    }

    accountNames.add(account.name);
  }

  if (
    !SHIFT_KPI_KEYS.every(
      key => metricKeys.has(key)
    ) ||
    !SHIFT_ACCOUNT_NAMES.every(
      name => accountNames.has(name)
    )
  ) {
    throw invalidSnapshot();
  }

  return {
    version: s.version,
    date,
    revision: s.revision,
    initialBalancesRequired:
      s.initialBalancesRequired === true,
    previousOfficialDate:
      s.previousOfficialDate ?? null,
    pendingCount:
      s.pendingCount ?? null,
    metrics: s.metrics,
    accounts: s.accounts,
    canSubmit: false as const
  };
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { date, mode } = paramsFor(request);
    const context = await requireSessionContext();

    if (
      process.env.PROFIN_R3_BAB_ACL_BRIDGE_ENABLED !== "true"
    ) {
      throw new AppError({
        status: 403,
        code: "R3_BAB_ACL_BRIDGE_DISABLED",
        userMessage: "Financial ACL bridge is disabled."
      });
    }

    if (
      mode === "SNAPSHOT" &&
      process.env.PROFIN_R3_BAB_FINANCIAL_READ_ENABLED !== "true"
    ) {
      throw new AppError({
        status: 403,
        code: "R3_BAB_FINANCIAL_READ_DISABLED",
        userMessage: "Financial reading has not been approved."
      });
    }

    const identity =
      await requireR3BabVerifiedIdentity(
        context,
        date
      );

    const response = await callAppsScriptAdapter<
      {
        mode: Mode;
        date: string;
        identity: typeof identity;
      },
      ReadResponse
    >({
      requestId,
      command: "getShiftFinancialSnapshot",
      context,
      operationDate: date,
      payload: {
        mode,
        date,
        identity
      }
    });

    const result = response.data?.result;

    if (
      !result ||
      result.authorized !== true ||
      result.readOnly !== true ||
      result.canSubmit !== false ||
      typeof result.isOwner !== "boolean"
    ) {
      throw new AppError({
        status: 502,
        code: "R3_BAB_ACL_RESPONSE_INVALID",
        userMessage: "Financial ACL response was not verified."
      });
    }

    if (mode === "ACL_CHECK") {
      if (result.snapshot !== undefined) {
        throw invalidSnapshot();
      }

      return noStore(
        apiOk(
          requestId,
          {
            version: VERSION,
            decision: "PASS",
            date,
            role: context.role,
            isOwner: result.isOwner,
            identityLinkVerified: true,
            appsScriptAclVerified: true,
            financialDataRead: false,
            canSubmit: false
          },
          "Financial ACL passed.",
          "R3_BAB_ACL_PASS"
        )
      );
    }

    return noStore(
      apiOk(
        requestId,
        {
          version: VERSION,
          decision: "READ_ONLY",
          identityLinkVerified: true,
          appsScriptAclVerified: true,
          snapshot: validateSnapshot(
            result.snapshot,
            date
          ),
          canSubmit: false
        },
        "Financial snapshot read only.",
        "R3_BAB_READ_ONLY"
      )
    );
  } catch (error) {
  if (process.env.NODE_ENV === "development") {
    const err =
      error instanceof Error
        ? error
        : new Error(String(error));

    console.error("[R3_SECURE_READ_ERROR]", {
      requestId,
      name: err.name,
      message: err.message,
      cause:
        err.cause instanceof Error
          ? err.cause.message
          : undefined,
      stack: err.stack?.split("\n").slice(0, 6).join("\n")
    });
  }

  return noStore(
    apiFromError(requestId, error)
  );
}
}
