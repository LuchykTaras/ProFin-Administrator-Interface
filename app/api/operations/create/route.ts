import type {
  CreateOperationInput,
  CreateOperationResult
} from "@/lib/contracts/operations";

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
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime =
  "nodejs";


export const dynamic =
  "force-dynamic";


type UnknownRecord =
  Record<string, unknown>;


type AppsScriptCreateOperationData = {
  idempotencyReplayed:
    boolean;

  idempotencyKey:
    string;

  result:
    CreateOperationResult;

  status:
    "OK";
};


const TRUSTED_CONTEXT_KEYS =
  new Set([
    "projectId",
    "project_id",
    "locationId",
    "location_id",
    "year",
    "activeYear",
    "active_year",
    "spreadsheetId",
    "spreadsheet_id",
    "annualRoute",
    "annual_route",
    "context",
    "actor",
    "role",
    "userId",
    "user_id"
  ]);


const ALLOWED_OPERATION_KEYS =
  new Set([
    "date",
    "account",
    "transferTo",
    "type",
    "category",
    "article",
    "doctor",
    "patientId",
    "newClient",
    "unitPrice",
    "quantity",
    "amount",
    "comment",
    "packageStart",
    "packageDuration",
    "packageMonthlyAmount",
    "packageAccrualStart",
    "vaccineName",
    "vaccineQty",
    "vaccineCost",
    "vaccineSeries",
    "storedVaccineId",
    "assetName",
    "assetCategory",
    "assetAmortization",
    "assetStartDate",
    "inventoryName",
    "inventorySeries",
    "inventoryExpiryDate",
    "inventorySupplier"
  ]);


const ALLOWED_NEW_CLIENT_KEYS =
  new Set([
    "name",
    "birthDate",
    "trustedPerson",
    "trustedPhone"
  ]);


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


function assertNoTrustedContextOverride(
  object:
    UnknownRecord,
  scope:
    string
): void {
  for (
    const key of Object.keys(
      object
    )
  ) {
    if (
      TRUSTED_CONTEXT_KEYS.has(
        key
      )
    ) {
      throw new AppError({
        status:
          403,

        code:
          "TRUSTED_CONTEXT_OVERRIDE_FORBIDDEN",

        userMessage:
          "Контекст проєкту, філії та року визначає сервер.",

        technicalMessage:
          `Forbidden trusted-context key ${scope}.${key}.`,

        retryable:
          false
      });
    }
  }
}


function normalizeNewClient(
  value:
    unknown
): CreateOperationInput["newClient"] {
  if (
    value === null ||
    typeof value ===
      "undefined"
  ) {
    return null;
  }

  if (
    !isRecord(
      value
    )
  ) {
    throw new AppError({
      status:
        400,

      code:
        "INVALID_NEW_CLIENT_PAYLOAD",

      userMessage:
        "Некоректний формат нового клієнта.",

      retryable:
        false
    });
  }

  assertNoTrustedContextOverride(
    value,
    "operation.newClient"
  );

  const unknownKeys =
    Object.keys(
      value
    ).filter(
      key =>
        !ALLOWED_NEW_CLIENT_KEYS.has(
          key
        )
    );

  if (
    unknownKeys.length
  ) {
    throw new AppError({
      status:
        400,

      code:
        "UNKNOWN_NEW_CLIENT_FIELD",

      userMessage:
        "Картка нового клієнта містить невідоме поле.",

      technicalMessage:
        `Unknown newClient fields: ${unknownKeys.join(
          ", "
        )}.`,

      retryable:
        false
    });
  }

  const name =
    typeof value.name ===
      "string"
      ? value.name.trim()
      : "";

  const birthDate =
    typeof value.birthDate ===
      "string"
      ? value.birthDate.trim()
      : "";

  const trustedPerson =
    typeof value.trustedPerson ===
      "string"
      ? value.trustedPerson.trim()
      : "";

  const trustedPhone =
    typeof value.trustedPhone ===
      "string"
      ? value.trustedPhone.trim()
      : "";

  if (
    !name ||
    !trustedPerson ||
    !trustedPhone ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      birthDate
    )
  ) {
    throw new AppError({
      status:
        400,

      code:
        "NEW_CLIENT_FIELDS_REQUIRED",

      userMessage:
        "Заповніть ПІБ дитини, дату народження, довірену особу та телефон.",

      retryable:
        false
    });
  }

  return {
    name,
    birthDate,
    trustedPerson,
    trustedPhone
  };
}


function normalizeOperation(
  value:
    unknown
): CreateOperationInput {
  if (
    !isRecord(
      value
    )
  ) {
    throw new AppError({
      status:
        400,

      code:
        "OPERATION_REQUIRED",

      userMessage:
        "Не передано дані операції.",

      retryable:
        false
    });
  }


  assertNoTrustedContextOverride(
    value,
    "operation"
  );


  const unknownKeys =
    Object.keys(
      value
    ).filter(
      key =>
        !ALLOWED_OPERATION_KEYS.has(
          key
        )
    );


  if (
    unknownKeys.length
  ) {
    throw new AppError({
      status:
        400,

      code:
        "UNKNOWN_OPERATION_FIELD",

      userMessage:
        "Форма містить невідоме поле операції.",

      technicalMessage:
        `Unknown operation fields: ${unknownKeys.join(
          ", "
        )}.`,

      retryable:
        false
    });
  }


  const date =
    typeof value.date ===
      "string"
      ? value.date.trim()
      : "";


  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date
    )
  ) {
    throw new AppError({
      status:
        400,

      code:
        "INVALID_OPERATION_DATE",

      userMessage:
        "Дата операції має формат YYYY-MM-DD.",

      retryable:
        false
    });
  }


  const type =
    typeof value.type ===
      "string"
      ? value.type.trim()
      : "";

  const category =
    typeof value.category ===
      "string"
      ? value.category.trim()
      : "";

  const article =
    typeof value.article ===
      "string"
      ? value.article.trim()
      : "";


  if (
    !type ||
    !category ||
    !article
  ) {
    throw new AppError({
      status:
        400,

      code:
        "OPERATION_CLASSIFICATION_REQUIRED",

      userMessage:
        "Оберіть тип, категорію та статтю операції.",

      retryable:
        false
    });
  }


  const newClient =
    normalizeNewClient(
      value.newClient
    );


  const patientId =
    typeof value.patientId ===
      "string"
      ? value.patientId.trim()
      : "";


  if (
    newClient &&
    patientId
  ) {
    throw new AppError({
      status:
        409,

      code:
        "NEW_CLIENT_AND_EXISTING_PATIENT_CONFLICT",

      userMessage:
        "Оберіть існуючого клієнта або створення нового клієнта.",

      retryable:
        false
    });
  }


  return {
    ...(value as CreateOperationInput),
    date,
    type,
    category,
    article,
    patientId:
      patientId || null,
    newClient
  };
}


export async function POST(
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
      "operation:create"
    );


    let body:
      unknown;


    try {
      body =
        await request.json();
    } catch {
      throw new AppError({
        status:
          400,

        code:
          "INVALID_JSON",

        userMessage:
          "Некоректний JSON-запит.",

        retryable:
          false
      });
    }


    if (
      !isRecord(
        body
      )
    ) {
      throw new AppError({
        status:
          400,

        code:
          "INVALID_REQUEST_BODY",

        userMessage:
          "Некоректний формат запиту.",

        retryable:
          false
      });
    }


    assertNoTrustedContextOverride(
      body,
      "body"
    );


    const bodyKeys =
      Object.keys(
        body
      );


    if (
      bodyKeys.length !== 1 ||
      bodyKeys[0] !==
        "operation"
    ) {
      throw new AppError({
        status:
          400,

        code:
          "INVALID_CREATE_OPERATION_BODY",

        userMessage:
          "Запит створення операції має містити лише operation.",

        technicalMessage:
          `Body keys: ${bodyKeys.join(
            ", "
          )}.`,

        retryable:
          false
      });
    }


    const operation =
      normalizeOperation(
        body.operation
      );


    const idempotencyKey =
      request.headers
        .get(
          "idempotency-key"
        )
        ?.trim() ??
      "";


    if (
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 200
    ) {
      throw new AppError({
        status:
          400,

        code:
          "IDEMPOTENCY_KEY_REQUIRED",

        userMessage:
          "Для проведення операції потрібен idempotency key.",

        technicalMessage:
          "Header idempotency-key must contain 16-200 characters.",

        retryable:
          false
      });
    }


    const adapterResponse =
      await callAppsScriptAdapter<
        {
          operation:
            CreateOperationInput;
        },
        AppsScriptCreateOperationData
      >({
        requestId,

        command:
          "createOperationWeb",

        context,

        operationDate:
          operation.date,

        idempotencyKey,

        payload: {
          operation
        }
      });


    const data =
      adapterResponse.data;


    if (
      !data ||
      !data.result ||
      !data.result.operationId
    ) {
      throw new AppError({
        status:
          502,

        code:
          "EMPTY_CREATE_OPERATION_RESULT",

        userMessage:
          "Apps Script не підтвердив створення операції.",

        retryable:
          false
      });
    }


    return apiOk(
      requestId,
      {
        operation:
          data.result,

        idempotencyReplayed:
          Boolean(
            data.idempotencyReplayed
          )
      },
      data.idempotencyReplayed
        ? "Повернуто результат уже проведеної операції."
        : "Операцію проведено.",
      "OPERATION_CREATED"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}
