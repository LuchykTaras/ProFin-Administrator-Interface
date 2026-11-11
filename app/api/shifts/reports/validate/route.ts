import {
  issueShiftGoogleChallenge,
  requireShiftGoogleToken,
  SHIFT_GOOGLE_COOKIE,
  SHIFT_GOOGLE_PATH,
  SHIFT_GOOGLE_TTL
} from "@/lib/server/r3-shift-google-proof";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import { AppError } from "@/lib/server/errors";

import {
  requireR3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";

import {
  requireSessionContext
} from "@/lib/server/session";

import {
  requireJsonObject,
  isRecord,
  assertAllowedKeys
} from "@/lib/server/operational-command-utils";

import {
  SHIFT_REPORT_ACCOUNT_KEYS,
  SHIFT_REPORT_METRIC_KEYS
} from "@/lib/contracts/shift-report-submission";

import {
  validateShiftReportSubmission
} from "@/lib/server/shift-report-submission-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "PROFIN_R3_05_03C_VALIDATE_V1";

type ReadResponse = {
  result?: {
    authorized?: boolean;
    isOwner?: boolean;
    readOnly?: boolean;
    canSubmit?: boolean;
    snapshot?: unknown;
  };
};

type GuardSnapshot =
  Parameters<typeof validateShiftReportSubmission>[3];

function fail(
  status: number,
  code: string,
  userMessage: string
): never {
  throw new AppError({
    status,
    code,
    userMessage
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

function validateDate(
  value: unknown,
  year: number
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return fail(
      400,
      "SHIFT_INVALID_DATE",
      "Некоректна дата зміни."
    );
  }

  const parsed =
    new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    Number(value.slice(0, 4)) !== year
  ) {
    return fail(
      400,
      "SHIFT_INVALID_YEAR",
      "Некоректна дата або обліковий рік."
    );
  }

  return value;
}

function exactKeys(
  input: unknown,
  keys: readonly string[]
): void {
  if (!isRecord(input)) {
    fail(
      400,
      "SHIFT_INVALID_STRUCTURE",
      "Некоректна структура звіту."
    );
  }

  const actual = Object.keys(input);

  if (
    actual.length !== keys.length ||
    actual.some(key => !keys.includes(key))
  ) {
    fail(
      400,
      "SHIFT_SCHEMA_MISMATCH",
      "Невідповідність полів звіту."
    );
  }
}

function validateTrustedSnapshot(
  input: unknown,
  date: string,
  body: Record<string, unknown>,
  trustedOwner: boolean
): GuardSnapshot {
  if (!isRecord(input)) {
    return fail(
      502,
      "SHIFT_SNAPSHOT_INVALID",
      "Некоректна відповідь фінансового ядра."
    );
  }

  if (
    input.date !== date ||
    typeof input.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.revision) ||
    typeof input.initialBalancesRequired !== "boolean" ||
    typeof input.canSubmit !== "boolean" ||
    !Array.isArray(input.metrics) ||
    !Array.isArray(input.accounts)
  ) {
    return fail(
      502,
      "SHIFT_SNAPSHOT_INVALID",
      "Не підтверджено структуру snapshot."
    );
  }

  const metricKeys = new Set<string>();

  const metrics: GuardSnapshot["metrics"] =
    input.metrics.map((entry: unknown) => {
      if (!isRecord(entry)) {
        return fail(
          502,
          "SHIFT_METRIC_SCHEMA_INVALID",
          "Некоректні KPI фінансового ядра."
        );
      }

      const key = entry.key;
      const auto = entry.auto;

      if (
        typeof key !== "string" ||
        !SHIFT_REPORT_METRIC_KEYS.some(k => k === key) ||
        metricKeys.has(key) ||
        typeof auto !== "number" ||
        !Number.isFinite(auto)
      ) {
        return fail(
          502,
          "SHIFT_METRIC_SCHEMA_INVALID",
          "Не підтверджено сім KPI."
        );
      }

      metricKeys.add(key);

      return { key, auto };
    });

  if (
    metrics.length !== SHIFT_REPORT_METRIC_KEYS.length ||
    !SHIFT_REPORT_METRIC_KEYS.every(
      key => metricKeys.has(key)
    )
  ) {
    fail(
      502,
      "SHIFT_METRIC_COUNT_INVALID",
      "Набір KPI неповний."
    );
  }


  const firstOfficial =
    input.initialBalancesRequired === true;

  let initialBalances:
    Record<string, unknown> | null = null;

  if (firstOfficial) {
    if (!trustedOwner) {
      fail(
        403,
        "SHIFT_OWNER_OPENING_REQUIRED",
        "Початкові залишки підтверджує тільки власник."
      );
    }

    if (body.confirmInitialBalances !== true) {
      fail(
        403,
        "SHIFT_OPENING_CONFIRMATION_REQUIRED",
        "Власник має підтвердити початкові залишки."
      );
    }

    exactKeys(
      body.initialBalances,
      SHIFT_REPORT_ACCOUNT_KEYS
    );

    initialBalances =
      body.initialBalances as Record<string, unknown>;
  }


  const accountNames = new Set<string>();

  const accounts: GuardSnapshot["accounts"] =
    input.accounts.map((entry: unknown) => {
      if (!isRecord(entry)) {
        return fail(
          502,
          "SHIFT_ACCOUNT_SCHEMA_INVALID",
          "Некоректний рахунок."
        );
      }

      const name = entry.name;

      if (
        typeof name !== "string" ||
        !SHIFT_REPORT_ACCOUNT_KEYS.some(k => k === name) ||
        accountNames.has(name)
      ) {
        return fail(
          502,
          "SHIFT_ACCOUNT_SCHEMA_INVALID",
          "Назви рахунків не збігаються."
        );
      }

      const flows = [
        "receipts",
        "payouts",
        "transferIn",
        "transferOut"
      ];

      if (
        !flows.every(
          key =>
            typeof entry[key] === "number" &&
            Number.isFinite(entry[key])
        ) ||
        !(
          entry.opening === null ||
          (
            typeof entry.opening === "number" &&
            Number.isFinite(entry.opening)
          )
        )
      ) {
        return fail(
          502,
          "SHIFT_ACCOUNT_VALUES_INVALID",
          "Неповні дані рахунків."
        );
      }

      
      const suppliedExpectedEnd = entry.expectedEnd;

      if (
        suppliedExpectedEnd !== undefined &&
        suppliedExpectedEnd !== null &&
        (
          typeof suppliedExpectedEnd !== "number" ||
          !Number.isFinite(suppliedExpectedEnd)
        )
      ) {
        return fail(
          502,
          "SHIFT_EXPECTED_END_INVALID",
          "Некоректний розрахунковий залишок."
        );
      }

      if (
        firstOfficial &&
        entry.opening !== null
      ) {
        return fail(
          502,
          "SHIFT_OPENING_STATE_CONFLICT",
          "Стан початкових залишків не відповідає ядру."
        );
      }

      const opening = firstOfficial
        ? initialBalances?.[name]
        : entry.opening;

      if (
        typeof opening !== "number" ||
        !Number.isFinite(opening) ||
        Math.abs(opening) > 1e10
      ) {
        return fail(
          firstOfficial ? 400 : 502,
          "SHIFT_OPENING_INVALID",
          "Некоректний початковий залишок."
        );
      }

      if (firstOfficial && opening < 0) {
        return fail(
          400,
          "SHIFT_OPENING_NEGATIVE",
          "Початковий залишок не може бути від'ємним."
        );
      }

      const expectedEnd = Math.round(
        (
          opening +
          (entry.receipts as number) -
          (entry.payouts as number) +
          (entry.transferIn as number) -
          (entry.transferOut as number)
        ) * 100
      ) / 100;

      if (
        !Number.isFinite(expectedEnd) ||
        Math.abs(expectedEnd) > 1e10
      ) {
        return fail(
          502,
          "SHIFT_EXPECTED_OVERFLOW",
          "Розрахунковий залишок поза допустимими межами."
        );
      }

      if (
        typeof suppliedExpectedEnd === "number" &&
        Math.abs(suppliedExpectedEnd - expectedEnd) >= 0.005
      ) {
        return fail(
          502,
          "SHIFT_EXPECTED_MISMATCH",
          "Розрахунок не збігається з фінансовим ядром."
        );
      }

      accountNames.add(name);

      return {
        name,
        expectedEnd
      };

    });

  if (
    accounts.length !== SHIFT_REPORT_ACCOUNT_KEYS.length ||
    !SHIFT_REPORT_ACCOUNT_KEYS.every(
      key => accountNames.has(key)
    )
  ) {
    fail(
      502,
      "SHIFT_ACCOUNT_COUNT_INVALID",
      "Набір рахунків неповний."
    );
  }

  if (input.alreadySubmitted === true) {
  fail(
    409,
    "SHIFT_ALREADY_SUBMITTED",
    "Звіт за цю дату вже існує."
  );
}

if (
  input.alreadySubmitted !== undefined &&
  input.alreadySubmitted !== false
) {
  fail(
    502,
    "SHIFT_ARCHIVE_STATUS_INVALID",
    "Некоректний архівний статус."
  );
}

  return {
    date,
    revision: input.revision,
    alreadySubmitted: false,
    canSubmit: input.canSubmit,
    initialBalancesRequired:
      input.initialBalancesRequired,
    metrics,
    accounts
  };
}


export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    if (
      context.role !== "OWNER" &&
      context.role !== "SENIOR_ADMIN"
    ) {
      fail(
        403,
        "SHIFT_ROLE_FORBIDDEN",
        "Недостатньо прав."
      );
    }

    const params =
      new URL(request.url).searchParams;

    const dates = params.getAll("date");

    if (
      dates.length !== 1 ||
      [...params.keys()].some(key => key !== "date")
    ) {
      fail(
        400,
        "SHIFT_GOOGLE_DATE_INVALID",
        "Некоректні параметри."
      );
    }

    const date = validateDate(
      dates[0],
      context.activeYear
    );

    await requireR3BabVerifiedIdentity(
      context,
      date
    );

    const challenge =
      issueShiftGoogleChallenge(context, date);

    const response = apiOk(
      requestId,
      {
        clientId: challenge.clientId,
        nonce: challenge.nonce,
        expiresInSeconds: SHIFT_GOOGLE_TTL,
        canSubmit: false
      },
      "Google challenge ready.",
      "SHIFT_GOOGLE_CHALLENGE_READY"
    );

    response.cookies.set(
      SHIFT_GOOGLE_COOKIE,
      challenge.cookieValue,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: SHIFT_GOOGLE_PATH,
        maxAge: SHIFT_GOOGLE_TTL
      }
    );

    return noStore(response);
  } catch (error) {
    return noStore(
      apiFromError(requestId, error)
    );
  }
}


export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    if (
      context.role !== "OWNER" &&
      context.role !== "SENIOR_ADMIN"
    ) {
      fail(
        403,
        "SHIFT_ROLE_FORBIDDEN",
        "Недостатньо прав для подання звіту."
      );
    }

    const url = new URL(request.url);

    if (url.search) {
      fail(
        400,
        "SHIFT_QUERY_FORBIDDEN",
        "Параметри URL не дозволені."
      );
    }

    const origin = request.headers.get("origin");

    if (!origin || origin !== url.origin) {
      fail(
        403,
        "SHIFT_CSRF_DENIED",
        "Недозволене джерело запиту."
      );
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    if (contentType !== "application/json") {
      fail(
        415,
        "SHIFT_JSON_REQUIRED",
        "Потрібен JSON-запит."
      );
    }

    const body =
      await requireJsonObject(request);

    assertAllowedKeys(
      body,
      new Set([
        "date",
        "revision",
        "metrics",
        "accounts",
        "initialBalances",
        "confirmInitialBalances",
        "comment"
      ]),
      "shiftReportValidation"
    );

    const date = validateDate(
      body.date,
      context.activeYear
    );

    if (
      typeof body.revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.revision)
    ) {
      fail(
        400,
        "SHIFT_INVALID_REVISION",
        "Некоректна ревізія."
      );
    }

    exactKeys(
      body.metrics,
      SHIFT_REPORT_METRIC_KEYS
    );

    exactKeys(
      body.accounts,
      SHIFT_REPORT_ACCOUNT_KEYS
    );

    if (
      process.env.PROFIN_R3_BAB_ACL_BRIDGE_ENABLED !==
      "true"
    ) {
      fail(
        403,
        "SHIFT_ACL_BRIDGE_DISABLED",
        "Фінансовий ACL-шлюз вимкнений."
      );
    }

    if (
      process.env.PROFIN_R3_BAB_FINANCIAL_READ_ENABLED !==
      "true"
    ) {
      fail(
        403,
        "SHIFT_FINANCIAL_READ_DISABLED",
        "Фінансове читання вимкнене."
      );
    }

    const identity =
  await requireR3BabVerifiedIdentity(
    context,
    date
  );

const googleProof =
  await requireShiftGoogleToken(
    request,
    context,
    date,
    identity
  );

const adapter =
  await callAppsScriptAdapter<
        {
          mode: "SNAPSHOT";
          date: string;
          identity: typeof identity;
        },
        ReadResponse
      >({
        requestId,
        command: "getShiftFinancialSnapshot",
        context,
        operationDate: date,
        signal: request.signal,
        payload: {
          mode: "SNAPSHOT",
          date,
          identity
        }
      });

    const result = adapter.data?.result;

    if (
      !result ||
      result.authorized !== true ||
      result.readOnly !== true ||
      result.canSubmit !== false ||
      typeof result.isOwner !== "boolean"
    ) {
      fail(
        502,
        "SHIFT_APPS_SCRIPT_ACL_INVALID",
        "Apps Script не підтвердив доступ."
      );
    }

    if (
      context.role === "OWNER" &&
      result.isOwner !== true
    ) {
      fail(
        403,
        "SHIFT_OWNER_ACL_DENIED",
        "Права власника не підтверджені ядром."
      );
    }

    const snapshot =
      validateTrustedSnapshot(
        result.snapshot,
        date,
        body,
        context.role === "OWNER" &&
          result.isOwner === true
      );

        const validation =
      validateShiftReportSubmission(
        body,
        context,
        {
        userId: context.userId,
        tokenVerifiedForRequest:
        googleProof.tokenVerifiedForRequest,
        appsScriptAclVerified:
        result.authorized === true &&
        result.readOnly === true
        },
        snapshot,
        "READ_ONLY_PREVALIDATION"
      );

    return noStore(
      apiOk(
        requestId,
        {
          version: VERSION,
          decision: "READ_ONLY_VALIDATION",
          date,
          revisionVerified: true,
          googleIdentityVerified: true,
          appsScriptAclVerified: true,
          requiresDomainReview:
            validation.requiresDomainReview,
          canSubmit: false,
          writePerformed: false
        },
        "Попередню перевірку завершено без запису.",
        "SHIFT_PREVALIDATION_OK"
      )
    );
  } catch (error) {
    return noStore(
      apiFromError(requestId, error)
    );
  }
}
