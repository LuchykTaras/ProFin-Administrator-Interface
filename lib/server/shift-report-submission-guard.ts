
import "server-only";

import {
  SHIFT_REPORT_ACCOUNT_KEYS,
  SHIFT_REPORT_METRIC_KEYS
} from "@/lib/contracts/shift-report-submission";

import type {
  ShiftReportAccountKey,
  ShiftReportMetricKey,
  ShiftReportSubmissionDraft
} from "@/lib/contracts/shift-report-submission";

import { AppError } from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";

type TrustedIdentity = {
  userId: string;
  tokenVerifiedForRequest: boolean;
  appsScriptAclVerified: boolean;
};

type TrustedSnapshot = {
  date: string;
  revision: string;
  alreadySubmitted: boolean;
  canSubmit: boolean;
  initialBalancesRequired: boolean;

  metrics: ReadonlyArray<{
    key: string;
    auto: number | null;
  }>;

  accounts: ReadonlyArray<{
    name: string;
    expectedEnd: number | null;
  }>;
};

function reject(
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

function object(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return reject(
      400,
      "SHIFT_INVALID_OBJECT",
      "Некоректна структура звіту."
    );
  }

  const row = value as Record<string, unknown>;
  const allowed = [...required, ...optional];

  if (
    Object.keys(row).some(k => !allowed.includes(k)) ||
    required.some(k => !Object.prototype.hasOwnProperty.call(row, k))
  ) {
    return reject(
      400,
      "SHIFT_INVALID_FIELDS",
      "Поля звіту не відповідають контракту."
    );
  }

  return row;
}

function number(
  value: unknown,
  whole = false
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e10 ||
    (whole && (!Number.isInteger(value) || value < 0))
  ) {
    return reject(
      400,
      "SHIFT_INVALID_NUMBER",
      "Некоректне числове значення."
    );
  }

  return value;
}

function comment(
  value: unknown,
  limit: number
): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (
    typeof value !== "string" ||
    value.trim().length > limit
  ) {
    return reject(
      400,
      "SHIFT_INVALID_COMMENT",
      "Некоректний коментар."
    );
  }

  return value.trim();
}

function dateOnly(
  value: unknown,
  year: number
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return reject(
      400,
      "SHIFT_INVALID_DATE",
      "Некоректна дата зміни."
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    Number(value.slice(0, 4)) !== year
  ) {
    return reject(
      400,
      "SHIFT_INVALID_YEAR",
      "Дата не відповідає обліковому року."
    );
  }

  return value;
}

export function validateShiftReportSubmission(
  input: unknown,
  context: SessionContext,
  identity: TrustedIdentity,
  snapshot: TrustedSnapshot,
  mode: "STRICT" | "READ_ONLY_PREVALIDATION" = "STRICT"
): {
  draft: ShiftReportSubmissionDraft;
  requiresDomainReview: true;
  writeAllowed: false;
} {
  if (
    context.role !== "OWNER" &&
    context.role !== "SENIOR_ADMIN"
  ) {
    reject(
      403,
      "SHIFT_ROLE_FORBIDDEN",
      "Недостатньо прав для подання звіту."
    );
  }

  if (
    identity.userId !== context.userId ||
    identity.tokenVerifiedForRequest !== true ||
    identity.appsScriptAclVerified !== true
  ) {
    reject(
      403,
      "SHIFT_GOOGLE_IDENTITY_REQUIRED",
      "Google-ідентичність не підтверджено."
    );
  }

  const row = object(
    input,
    ["date", "revision", "metrics", "accounts"],
    [
      "initialBalances",
      "confirmInitialBalances",
      "comment"
    ]
  );

  const date = dateOnly(row.date, context.activeYear);

  if (
    date !== snapshot.date ||
    typeof row.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.revision) ||
    row.revision !== snapshot.revision
  ) {
    reject(
      409,
      "SHIFT_STALE_REVISION",
      "Дані змінилися. Оновіть звіт."
    );
  }

  if (snapshot.alreadySubmitted === true) {
    reject(
      409,
      "SHIFT_ALREADY_SUBMITTED",
      "Звіт за цю дату вже подано."
    );
  }

    if (
    snapshot.canSubmit !== true &&
    !(
      mode === "READ_ONLY_PREVALIDATION" &&
      snapshot.canSubmit === false
    )
  ) {
    reject(
      403,
      "SHIFT_SUBMIT_BLOCKED",
      "Подання звіту наразі заблоковане."
    );
  }

  const sourceMetrics = new Map(
    snapshot.metrics.map(x => [x.key, x.auto])
  );

  const sourceAccounts = new Map(
    snapshot.accounts.map(x => [x.name, x.expectedEnd])
  );

  if (
    snapshot.metrics.length !== SHIFT_REPORT_METRIC_KEYS.length ||
    sourceMetrics.size !== SHIFT_REPORT_METRIC_KEYS.length ||
    snapshot.accounts.length !== SHIFT_REPORT_ACCOUNT_KEYS.length ||
    sourceAccounts.size !== SHIFT_REPORT_ACCOUNT_KEYS.length
  ) {
    reject(
      409,
      "SHIFT_SNAPSHOT_SCHEMA_MISMATCH",
      "Схема фінансового snapshot не збігається."
    );
  }

  const metricInput = object(
    row.metrics,
    SHIFT_REPORT_METRIC_KEYS
  );

  const metrics = {} as ShiftReportSubmissionDraft["metrics"];

  for (const key of SHIFT_REPORT_METRIC_KEYS) {
    const item = object(
      metricInput[key],
      ["actual"],
      ["comment"]
    );

    const actual = number(
      item.actual,
      key !== "dailyReceipts"
    );

    const auto = sourceMetrics.get(key);

    if (
      typeof auto !== "number" ||
      !Number.isFinite(auto)
    ) {
      reject(
        409,
        "SHIFT_METRIC_UNAVAILABLE",
        "Автоматичний показник недоступний."
      );
    }

    const note = comment(item.comment, 500);

    if (Math.abs(actual - auto) >= 0.005 && !note) {
      reject(
        400,
        "SHIFT_METRIC_REASON_REQUIRED",
        "Для розбіжності KPI потрібен коментар."
      );
    }

    metrics[key as ShiftReportMetricKey] = {
      actual,
      comment: note
    };
  }

  const accountInput = object(
    row.accounts,
    SHIFT_REPORT_ACCOUNT_KEYS
  );

  const accounts = {} as ShiftReportSubmissionDraft["accounts"];

  for (const name of SHIFT_REPORT_ACCOUNT_KEYS) {
    const item = object(
      accountInput[name],
      ["actualEnd"],
      ["comment"]
    );

    const actualEnd = number(item.actualEnd);
    const expectedEnd = sourceAccounts.get(name);

    if (!sourceAccounts.has(name)) {
      reject(
        409,
        "SHIFT_ACCOUNT_SCHEMA_MISMATCH",
        "Назви рахунків не відповідають ядру."
      );
    }

    if (
      (name === "Каса, грн" || name === "Сейф") &&
      actualEnd < 0
    ) {
      reject(
        400,
        "SHIFT_NEGATIVE_CASH",
        "Готівковий залишок не може бути від'ємним."
      );
    }

    if (
      expectedEnd !== null &&
      (typeof expectedEnd !== "number" ||
        !Number.isFinite(expectedEnd))
    ) {
      reject(
        409,
        "SHIFT_EXPECTED_UNAVAILABLE",
        "Розрахунковий залишок недоступний."
      );
    }

    if (
      expectedEnd === null &&
      snapshot.initialBalancesRequired !== true
    ) {
      reject(
        409,
        "SHIFT_EXPECTED_UNAVAILABLE",
        "Не визначено розрахунковий залишок."
      );
    }

    const note = comment(item.comment, 500);

    if (
      typeof expectedEnd === "number" &&
      Math.abs(actualEnd - expectedEnd) >= 0.005 &&
      !note
    ) {
      reject(
        400,
        "SHIFT_ACCOUNT_REASON_REQUIRED",
        "Для розбіжності рахунку потрібен коментар."
      );
    }

    accounts[name as ShiftReportAccountKey] = {
      actualEnd,
      comment: note
    };
  }

  const initialBalances =
    {} as Record<ShiftReportAccountKey, number>;

  if (snapshot.initialBalancesRequired === true) {
    if (
      context.role !== "OWNER" ||
      row.confirmInitialBalances !== true
    ) {
      reject(
        403,
        "SHIFT_OWNER_OPENING_REQUIRED",
        "Початкові залишки має підтвердити власник."
      );
    }

    const source = object(
      row.initialBalances,
      SHIFT_REPORT_ACCOUNT_KEYS
    );

    for (const name of SHIFT_REPORT_ACCOUNT_KEYS) {
      const value = number(source[name]);

      if (value < 0) {
        reject(
          400,
          "SHIFT_NEGATIVE_OPENING",
          "Початковий залишок не може бути від'ємним."
        );
      }

      initialBalances[name] = value;
    }
  } else {
    if (
      row.confirmInitialBalances === true ||
      row.initialBalances !== undefined
    ) {
      reject(
        400,
        "SHIFT_OPENING_OVERRIDE_FORBIDDEN",
        "Початкові залишки визначає сервер."
      );
    }
  }

  return {
    draft: {
      date,
      revision: snapshot.revision,
      metrics,
      accounts,
      ...(snapshot.initialBalancesRequired
        ? {
            confirmInitialBalances: true,
            initialBalances
          }
        : {}),
      comment: comment(row.comment, 2000)
    },
    requiresDomainReview: true,
    writeAllowed: false
  };
}
