import "server-only";

import {
  INVENTORY_CONTRACT_VERSION
} from "@/lib/contracts/inventory";

import type {
  InventoryData,
  InventoryLotItem
} from "@/lib/contracts/inventory";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  AppError
} from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";


type UnknownRecord =
  Record<string, unknown>;


type GetInventoryParams = {
  requestId:
    string;

  context:
    SessionContext;

  signal:
    AbortSignal;
};


type InventoryAdapterData = {
  result?:
    unknown;

  status?:
    string;
};


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


function requireString(
  value:
    unknown,

  fieldName:
    string
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_INVENTORY_ITEM",

      userMessage:
        "Доменне ядро повернуло некоректні дані складу.",

      technicalMessage:
        `${fieldName} must be a non-empty string.`,

      retryable:
        false
    });
  }


  return value.trim();
}


function normalizeNullableString(
  value:
    unknown,

  fieldName:
    string
): string | null {
  if (
    value === null ||
    typeof value ===
      "undefined" ||
    value === ""
  ) {
    return null;
  }


  if (
    typeof value !==
      "string"
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_INVENTORY_ITEM",

      userMessage:
        "Доменне ядро повернуло некоректні дані складу.",

      technicalMessage:
        `${fieldName} must be string|null.`,

      retryable:
        false
    });
  }


  const normalized =
    value.trim();


  return normalized || null;
}


function normalizeExpiryDate(
  value:
    unknown
): string | null {
  const normalized =
    normalizeNullableString(
      value,
      "expiryDate"
    );


  if (
    normalized === null
  ) {
    return null;
  }


  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_INVENTORY_EXPIRY_DATE",

      userMessage:
        "Доменне ядро повернуло некоректний строк придатності.",

      technicalMessage:
        `expiryDate=${normalized}; expected YYYY-MM-DD.`,

      retryable:
        false
    });
  }


  return normalized;
}


function parseInventoryItem(
  value:
    unknown,

  context:
    SessionContext
): InventoryLotItem {
  if (
    !isRecord(
      value
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_INVENTORY_ITEM",

      userMessage:
        "Доменне ядро повернуло некоректну позицію складу.",

      retryable:
        false
    });
  }


  const availableQuantity =
    Number(
      value.availableQuantity
    );


  if (
    !Number.isFinite(
      availableQuantity
    ) ||
    availableQuantity < 0
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_INVENTORY_QUANTITY",

      userMessage:
        "Доменне ядро повернуло некоректний залишок складу.",

      technicalMessage:
        `availableQuantity=${String(
          value.availableQuantity
        )}.`,

      retryable:
        false
    });
  }


  const locationId =
    requireString(
      value.locationId,
      "locationId"
    );


  /*
   * Склад не може повернути
   * партії іншої філії.
   *
   * Trusted location береться
   * тільки із server session.
   */
  if (
    locationId !==
      context.locationId
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVENTORY_LOCATION_MISMATCH",

      userMessage:
        "Доменне ядро повернуло склад іншої філії.",

      technicalMessage:
        `Expected locationId=${context.locationId}, got ${locationId}.`,

      retryable:
        false
    });
  }


  return {
    lotId:
      requireString(
        value.lotId,
        "lotId"
      ),

    inventoryType:
      normalizeNullableString(
        value.inventoryType,
        "inventoryType"
      ),

    inventoryName:
      requireString(
        value.inventoryName,
        "inventoryName"
      ),

    series:
      normalizeNullableString(
        value.series,
        "series"
      ),

    expiryDate:
      normalizeExpiryDate(
        value.expiryDate
      ),

    availableQuantity,

    unit:
      normalizeNullableString(
        value.unit,
        "unit"
      ),

    status:
      requireString(
        value.status,
        "status"
      ),

    locationId,

    // Canonical name is resolved from the authorized session.
  locationName:
  context.locationName
  };
}


function parseInventoryResult(
  value:
    unknown,

  context:
    SessionContext
): InventoryData {
  if (
    !isRecord(
      value
    ) ||

    value.version !==
      INVENTORY_CONTRACT_VERSION ||

    typeof value.sourceSheet !==
      "string" ||
    !value.sourceSheet.trim() ||

    typeof value.checkedAt !==
      "string" ||
    !value.checkedAt.trim() ||

    typeof value.timezone !==
      "string" ||
    !value.timezone.trim() ||

    typeof value.locationId !==
      "string" ||

    typeof value.locationName !==
      "string" ||

    !Array.isArray(
      value.items
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_INVENTORY_RESULT",

      userMessage:
        "Доменне ядро повернуло некоректну відповідь складу.",

      technicalMessage:
        "Apps Script result does not match PROFIN_INVENTORY_READ_V1.",

      retryable:
        false
    });
  }


  /*
   * Захист від випадкового
   * повернення складу
   * іншої філії.
   */
  if (
    value.locationId !==
      context.locationId
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVENTORY_LOCATION_MISMATCH",

      userMessage:
        "Доменне ядро повернуло склад іншої філії.",

      technicalMessage:
        `Expected locationId=${context.locationId}, got ${String(
          value.locationId
        )}.`,

      retryable:
        false
    });
  }


  /*
   * Domain core і web cabinet
   * повинні працювати
   * в одній timezone.
   */
  if (
    value.timezone !==
      context.timezone
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVENTORY_TIMEZONE_MISMATCH",

      userMessage:
        "Доменне ядро повернуло склад з некоректною timezone.",

      technicalMessage:
        `Expected timezone=${context.timezone}, got ${String(
          value.timezone
        )}.`,

      retryable:
        false
    });
  }


  const items =
    value.items.map(
      item =>
        parseInventoryItem(
          item,
          context
        )
    );


  return {
    version:
      INVENTORY_CONTRACT_VERSION,

    sourceSheet:
      value.sourceSheet.trim(),

    checkedAt:
      value.checkedAt.trim(),

    timezone:
      value.timezone.trim(),

    locationId:
      context.locationId,

// Do not display untrusted labels supplied by the adapter.
locationName:
  context.locationName,

    /*
     * Не довіряємо total
     * від adapter.
     *
     * Єдиний фактичний total —
     * кількість валідованих items.
     */
    total:
      items.length,

    items
  };
}


export async function getInventory(
  params:
    GetInventoryParams
): Promise<InventoryData> {
  const response =
    await callAppsScriptAdapter<
      Record<string, never>,
      InventoryAdapterData
    >({
      requestId:
        params.requestId,

      command:
        "getInventory",

      context:
        params.context,

      /*
       * Read-only команда.
       * Browser не передає:
       *
       * spreadsheetId
       * locationId
       * FEFO settings
       */
      payload:
        {},

      idempotencyKey:
        null,

      signal:
        params.signal
    });


  const data =
    response.data;


  if (
    !data ||
    !isRecord(
      data
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "EMPTY_INVENTORY_RESPONSE",

      userMessage:
        "Доменне ядро не повернуло дані складу.",

      retryable:
        true
    });
  }


  /*
   * Підтримуємо обидві форми:
   *
   * data.result
   *
   * або
   *
   * data
   *
   * Аналогічно до Journal.
   */
  const result =
    "result" in data
      ? data.result
      : data;


  return parseInventoryResult(
    result,
    params.context
  );
}