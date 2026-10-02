import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  AppError
} from "@/lib/server/errors";

import {
  getOperationJournal
} from "@/lib/server/operation-journal";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime =
  "nodejs";


export const dynamic =
  "force-dynamic";


function parseAfterRow(
  raw:
    string | null
): number | null {
  if (
    raw === null ||
    raw.trim() === ""
  ) {
    return null;
  }

  if (
    !/^\d+$/.test(
      raw
    )
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

  const value =
    Number(
      raw
    );

  if (
    !Number.isSafeInteger(
      value
    )
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


export async function GET(
  request:
    Request
) {
  const requestId =
    getRequestId(
      request
    );

  try {
    const context =
      await requireSessionContext();

    assertPermission(
      context,
      "journal:read"
    );

    const url =
      new URL(
        request.url
      );

    const requestedMonth =
      url.searchParams
        .get("month")
        ?.trim() ||
      null;

    const afterRow =
      parseAfterRow(
        url.searchParams.get(
          "afterRow"
        )
      );

      const journal =
    await getOperationJournal({
      requestId,
      context,
      requestedMonthKey:
        requestedMonth,
      afterRow,

      /*
       * PATCH 48
       *
       * Browser abort
       * прокидаємо нижче у
       * server-side transport.
       */
      signal:
        request.signal
    });

    return apiOk(
      requestId,
      journal,
      journal.mode ===
        "DELTA"
        ? "Нові записи журналу отримано."
        : "Журнал операцій за місяць отримано.",
      journal.mode ===
        "DELTA"
        ? "OPERATION_JOURNAL_DELTA"
        : "OPERATION_JOURNAL_MONTH"
    );
  } catch (
    error
  ) {
    return apiFromError(
      requestId,
      error
    );
  }
}