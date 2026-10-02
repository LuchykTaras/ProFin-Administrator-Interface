import "server-only";

import {
  OPERATION_JOURNAL_CONTRACT_VERSION
} from "@/lib/contracts/journal";

import type {
  OperationJournalCellValue,
  OperationJournalColumnKey,
  OperationJournalData,
  OperationJournalMode,
  OperationJournalRow
} from "@/lib/contracts/journal";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  AppError
} from "@/lib/server/errors";

import {
  resolveJournalColumnPolicy
} from "@/lib/server/journal-policy";

import type {
  SessionContext
} from "@/lib/server/session";


type UnknownRecord =
  Record<string, unknown>;


type GetOperationJournalParams = {
  requestId:
    string;


  context:
    SessionContext;


  requestedMonthKey?:
    string | null;


  afterRow?:
    number | null;


  /*
   * PATCH 48
   *
   * Сигнал скасування
   * від HTTP route.
   */
  signal:
    AbortSignal;
};


type AppsScriptJournalData = {
  result?:
    unknown;

  status?:
    string;
};


type MonthContext = {
  monthKey:
    string;

  year:
    number;

  month:
    number;

  from:
    string;

  to:
    string;

  isCurrentMonth:
    boolean;
};


const JOURNAL_SOURCE_SHEET =
  "База операцій" as const;


const ALLOWED_KEYS:
  readonly OperationJournalColumnKey[] = [
    "operationId",
    "account",
    "targetAccount",
    "transactionDate",
    "unitPrice",
    "quantity",
    "amount",
    "doctor",
    "patient",
    "operationType",
    "category",
    "article",
    "comment",
    "paymentMonth",
    "accrualMonth",
    "accountingType",
    "packageName",
    "packageStartDate",
    "packageDuration",
    "packageMonthlyAmount",
    "vaccineName",
    "vaccineQuantity",
    "vaccineUseDate",
    "vaccineCost",
    "vaccineId",
    "assetName",
    "assetCategory",
    "assetAmortizationYears",
    "assetStartDate",
    "recordStatus",
    "createdDate",
    "createdTime",
    "createdBy"
  ];


function isRecord(
  value:
    unknown
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}


function getZonedDateParts(
  timezone:
    string
): {
  year:
    number;

  month:
    number;

  day:
    number;
} {
  let formatter:
    Intl.DateTimeFormat;

  try {
    formatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            timezone,
          year:
            "numeric",
          month:
            "2-digit",
          day:
            "2-digit"
        }
      );
  } catch {
    throw new AppError({
      status:
        500,
      code:
        "INVALID_PROJECT_TIMEZONE",
      userMessage:
        "Некоректна timezone у конфігурації кабінету.",
      technicalMessage:
        `Unsupported IANA timezone: ${timezone}.`,
      retryable:
        false
    });
  }

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const partMap =
    new Map(
      parts.map(
        part => [
          part.type,
          part.value
        ]
      )
    );

  const year =
    Number(
      partMap.get(
        "year"
      )
    );

  const month =
    Number(
      partMap.get(
        "month"
      )
    );

  const day =
    Number(
      partMap.get(
        "day"
      )
    );

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new AppError({
      status:
        500,
      code:
        "CURRENT_DATE_RESOLUTION_FAILED",
      userMessage:
        "Не вдалося визначити поточну дату кабінету.",
      retryable:
        true
    });
  }

  return {
    year,
    month,
    day
  };
}


function formatMonthKey(
  year:
    number,
  month:
    number
): string {
  return `${year}-${String(
    month
  ).padStart(2, "0")}`;
}


function formatIsoDate(
  year:
    number,
  month:
    number,
  day:
    number
): string {
  return [
    String(year).padStart(
      4,
      "0"
    ),
    String(month).padStart(
      2,
      "0"
    ),
    String(day).padStart(
      2,
      "0"
    )
  ].join("-");
}


function resolveMonthContext(
  context:
    SessionContext,
  requestedMonthKey:
    string | null | undefined
): MonthContext {
  const current =
    getZonedDateParts(
      context.timezone
    );

  const currentMonthKey =
    formatMonthKey(
      current.year,
      current.month
    );

  let year:
    number;

  let month:
    number;

  if (
    requestedMonthKey
  ) {
    const match =
      /^(\d{4})-(\d{2})$/.exec(
        requestedMonthKey.trim()
      );

    if (!match) {
      throw new AppError({
        status:
          400,
        code:
          "INVALID_JOURNAL_MONTH",
        userMessage:
          "Місяць журналу має формат YYYY-MM.",
        retryable:
          false
      });
    }

    year =
      Number(
        match[1]
      );

    month =
      Number(
        match[2]
      );
  } else {
    if (
      current.year !==
      context.activeYear
    ) {
      throw new AppError({
        status:
          409,
        code:
          "ACTIVE_YEAR_CURRENT_MONTH_MISMATCH",
        userMessage:
          "Поточний місяць не належить активному обліковому року.",
        technicalMessage:
          `Current zoned year ${current.year}, active year ${context.activeYear}.`,
        retryable:
          false
      });
    }

    year =
      current.year;

    month =
      current.month;
  }

  if (
    year !==
    context.activeYear
  ) {
    throw new AppError({
      status:
        409,
      code:
        "JOURNAL_MONTH_OUTSIDE_ACTIVE_YEAR",
      userMessage:
        "Запитаний місяць не належить активному обліковому року.",
      technicalMessage:
        `Requested year ${year}, active year ${context.activeYear}.`,
      retryable:
        false
    });
  }

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new AppError({
      status:
        400,
      code:
        "INVALID_JOURNAL_MONTH",
      userMessage:
        "Некоректний місяць журналу.",
      retryable:
        false
    });
  }

  const lastDay =
    new Date(
      Date.UTC(
        year,
        month,
        0
      )
    ).getUTCDate();

  const monthKey =
    formatMonthKey(
      year,
      month
    );

  return {
    monthKey,
    year,
    month,
    from:
      formatIsoDate(
        year,
        month,
        1
      ),
    to:
      formatIsoDate(
        year,
        month,
        lastDay
      ),
    isCurrentMonth:
      monthKey ===
      currentMonthKey
  };
}


function normalizeAfterRow(
  value:
    number | null | undefined
): number | null {
  if (
    value === null ||
    typeof value ===
      "undefined"
  ) {
    return null;
  }

  if (
    !Number.isInteger(value) ||
    value < 2
  ) {
    throw new AppError({
      status:
        400,
      code:
        "INVALID_JOURNAL_AFTER_ROW",
      userMessage:
        "Некоректний курсор оновлення журналу.",
      retryable:
        false
    });
  }

  return value;
}


function isColumnKey(
  value:
    unknown
): value is OperationJournalColumnKey {
  return (
    typeof value ===
      "string" &&
    ALLOWED_KEYS.includes(
      value as OperationJournalColumnKey
    )
  );
}


function normalizeCellValue(
  value:
    unknown
): OperationJournalCellValue {
  if (
    value === null ||
    typeof value ===
      "undefined"
  ) {
    return null;
  }

  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return value;
  }

  if (
    typeof value ===
      "string"
  ) {
    return value;
  }

  if (
    typeof value ===
      "boolean"
  ) {
    return value
      ? "true"
      : "false";
  }

  return String(
    value
  );
}


function normalizeRow(
  value:
    unknown
): OperationJournalRow {
  if (
    !isRecord(
      value
    )
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_ROW",
      userMessage:
        "Доменне ядро повернуло некоректний рядок журналу.",
      retryable:
        false
    });
  }

  const rowNumber =
    Number(
      value.rowNumber
    );

  if (
    !Number.isInteger(
      rowNumber
    ) ||
    rowNumber < 2
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_ROW_NUMBER",
      userMessage:
        "Доменне ядро повернуло некоректний номер рядка журналу.",
      technicalMessage:
        `rowNumber=${String(
          value.rowNumber
        )}`,
      retryable:
        false
    });
  }

  if (
    !isRecord(
      value.values
    )
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_ROW_VALUES",
      userMessage:
        "Доменне ядро повернуло некоректні значення журналу.",
      retryable:
        false
    });
  }

  const normalizedValues:
    OperationJournalRow["values"] =
      {};

  for (
    const [
      key,
      rawValue
    ] of Object.entries(
      value.values
    )
  ) {
    if (
      !isColumnKey(
        key
      )
    ) {
      continue;
    }

    normalizedValues[
      key
    ] =
      normalizeCellValue(
        rawValue
      );
  }

  return {
    rowNumber,
    values:
      normalizedValues
  };
}


function projectRow(
  row:
    OperationJournalRow,
  visibleKeys:
    ReadonlySet<OperationJournalColumnKey>
): OperationJournalRow {
  const values:
    OperationJournalRow["values"] =
      {};

  for (
    const [
      key,
      value
    ] of Object.entries(
      row.values
    )
  ) {
    if (
      !isColumnKey(
        key
      ) ||
      !visibleKeys.has(
        key
      )
    ) {
      continue;
    }

    values[
      key
    ] =
      value;
  }

  return {
    rowNumber:
      row.rowNumber,
    values
  };
}


function normalizeAdapterResult(
  value:
    unknown,
  month:
    MonthContext,
  mode:
    OperationJournalMode,
  policy:
    ReturnType<
      typeof resolveJournalColumnPolicy
    >
): OperationJournalData {
  if (
    !isRecord(
      value
    )
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_RESULT",
      userMessage:
        "Доменне ядро повернуло некоректний журнал операцій.",
      retryable:
        false
    });
  }

  if (
    value.sourceSheet !==
      JOURNAL_SOURCE_SHEET
  ) {
    throw new AppError({
      status:
        502,
      code:
        "JOURNAL_SOURCE_MISMATCH",
      userMessage:
        "Доменне ядро повернуло невідоме джерело журналу.",
      technicalMessage:
        `Expected ${JOURNAL_SOURCE_SHEET}, got ${String(
          value.sourceSheet
        )}.`,
      retryable:
        false
    });
  }

  if (
    value.monthKey !==
      month.monthKey
  ) {
    throw new AppError({
      status:
        502,
      code:
        "JOURNAL_MONTH_MISMATCH",
      userMessage:
        "Доменне ядро повернуло дані іншого місяця.",
      technicalMessage:
        `Expected ${month.monthKey}, got ${String(
          value.monthKey
        )}.`,
      retryable:
        false
    });
  }

  if (
    !Array.isArray(
      value.rows
    )
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_ROWS",
      userMessage:
        "Доменне ядро повернуло некоректний список операцій.",
      retryable:
        false
    });
  }

  const rows =
    value.rows
      .map(
        normalizeRow
      )
      .map(
        row =>
          projectRow(
            row,
            policy.visibleKeys
          )
      );

  const latestRowNumber =
    value.latestRowNumber ===
      null ||
    typeof value.latestRowNumber ===
      "undefined"
      ? null
      : Number(
          value.latestRowNumber
        );

  if (
    latestRowNumber !== null &&
    (
      !Number.isInteger(
        latestRowNumber
      ) ||
      latestRowNumber < 2
    )
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_LATEST_ROW",
      userMessage:
        "Доменне ядро повернуло некоректний курсор журналу.",
      retryable:
        false
    });
  }

  const latestOperationId =
    typeof value.latestOperationId ===
      "string" &&
    value.latestOperationId.trim()
      ? value.latestOperationId.trim()
      : null;

  const monthTotal =
    value.monthTotal ===
      null ||
    typeof value.monthTotal ===
      "undefined"
      ? null
      : Number(
          value.monthTotal
        );

  if (
    monthTotal !== null &&
    (
      !Number.isInteger(
        monthTotal
      ) ||
      monthTotal < 0
    )
  ) {
    throw new AppError({
      status:
        502,
      code:
        "INVALID_JOURNAL_MONTH_TOTAL",
      userMessage:
        "Доменне ядро повернуло некоректну кількість операцій.",
      retryable:
        false
    });
  }

  return {
    contractVersion:
      OPERATION_JOURNAL_CONTRACT_VERSION,
    sourceSheet:
      JOURNAL_SOURCE_SHEET,
    policyVersion:
      policy.version,
    monthKey:
      month.monthKey,
    period: {
      from:
        month.from,
      to:
        month.to
    },
    isCurrentMonth:
      month.isCurrentMonth,
    live:
      month.isCurrentMonth,
    mode,
    returnedCount:
      rows.length,
    monthTotal:
      mode === "INITIAL"
        ? monthTotal ?? rows.length
        : null,
    latestRowNumber:
      latestRowNumber ??
      (
        rows.length
          ? Math.max(
              ...rows.map(
                row =>
                  row.rowNumber
              )
            )
          : null
      ),
    latestOperationId,
    columns:
      policy.columns.map(
        column => ({
          ...column
        })
      ),
    rows
  };
}


export async function getOperationJournal(
  params:
    GetOperationJournalParams
): Promise<OperationJournalData> {
  const month =
    resolveMonthContext(
      params.context,
      params.requestedMonthKey
    );

  const afterRow =
    normalizeAfterRow(
      params.afterRow
    );

  if (
    afterRow !== null &&
    !month.isCurrentMonth
  ) {
    throw new AppError({
      status:
        400,
      code:
        "JOURNAL_DELTA_ONLY_FOR_CURRENT_MONTH",
      userMessage:
        "Фонове оновлення доступне лише для поточного місяця.",
      retryable:
        false
    });
  }

  const mode:
    OperationJournalMode =
      afterRow === null
        ? "INITIAL"
        : "DELTA";

  const policy =
    resolveJournalColumnPolicy(
      params.context
    );

  const adapterResponse =
    await callAppsScriptAdapter<
      {
        monthKey:
          string;
        from:
          string;
        to:
          string;
        afterRow:
          number | null;
        mode:
          OperationJournalMode;
      },
      AppsScriptJournalData
        >({
      requestId:
        params.requestId,

      command:
        "getOperationJournal",

      context:
        params.context,

      idempotencyKey:
        null,

      /*
       * PATCH 48
       *
       * Route AbortSignal
       * передаємо transport-рівню.
       */
      signal:
        params.signal,

      payload: {
        monthKey:
          month.monthKey,

        from:
          month.from,

        to:
          month.to,

        afterRow,

        mode
      }
    });

  const responseData =
    adapterResponse.data;

  if (
    !responseData ||
    typeof responseData !==
      "object"
  ) {
    throw new AppError({
      status:
        502,
      code:
        "EMPTY_JOURNAL_RESPONSE",
      userMessage:
        "Доменне ядро не повернуло журнал операцій.",
      retryable:
        false
    });
  }

  return normalizeAdapterResult(
    responseData.result ??
      responseData,
    month,
    mode,
    policy
  );
}