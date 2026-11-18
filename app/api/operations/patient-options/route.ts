
import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  AppError
} from "@/lib/server/errors";

import type {
  OperationFieldOption
} from "@/lib/contracts/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    assertPermission(
      context,
      "operation:create"
    );

    if (
      process.env
        .NEXT_PUBLIC_PROFIN_PARALLEL_INCOME_SCHEMA_ENABLED !==
      "true"
    ) {
      throw new AppError({
        status: 404,
        code: "PATIENT_OPTIONS_DISABLED",
        userMessage: "Маршрут недоступний.",
        retryable: false
      });
    }

    const response = await callAppsScriptAdapter<
      {
        schemaMode: "PATIENTS_ONLY";
        operationType: "Доходи";
        category: null;
        article: null;
      },
      unknown
    >({
      requestId,
      command: "getOperationFormSchemaWeb",
      context,
      idempotencyKey: null,
      signal: request.signal,
      payload: {
        schemaMode: "PATIENTS_ONLY",
        operationType: "Доходи",
        category: null,
        article: null
      }
    });

    const envelopeData = response.data;

    const data =
      isRecord(envelopeData) &&
      "result" in envelopeData
        ? envelopeData.result
        : envelopeData;

    if (
      !isRecord(data) ||
      data.source !== "DOMAIN" ||
      data.schemaMode !== "PATIENTS_ONLY" ||
      data.operationType !== "Доходи" ||
      !Array.isArray(data.patients)
    ) {
      throw new AppError({
        status: 502,
        code: "INVALID_PATIENT_OPTIONS_RESPONSE",
        userMessage:
          "Некоректна відповідь довідника пацієнтів.",
        retryable: false
      });
    }

    const patients: OperationFieldOption[] = [];
    const usedIds = new Set<string>();

    for (const item of data.patients) {
      if (
        !isRecord(item) ||
        typeof item.value !== "string" ||
        typeof item.label !== "string"
      ) {
        throw new AppError({
          status: 502,
          code: "INVALID_PATIENT_OPTION",
          userMessage:
            "Некоректні дані пацієнтів.",
          retryable: false
        });
      }

      const value = item.value.trim();
      const label = item.label.trim();

      if (
        !value ||
        !label ||
        usedIds.has(value)
      ) {
        throw new AppError({
          status: 502,
          code: "INVALID_PATIENT_OPTION",
          userMessage:
            "Некоректні або повторні ID пацієнтів.",
          retryable: false
        });
      }

      usedIds.add(value);
      patients.push({ value, label });
    }

    const result = apiOk(
      requestId,
      { patients },
      "Список пацієнтів отримано.",
      "OPERATION_PATIENT_OPTIONS"
    );

    result.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    return result;
  } catch (error) {
    const result = apiFromError(
      requestId,
      error
    );

    result.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    return result;
  }
}
