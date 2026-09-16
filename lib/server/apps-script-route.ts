import "server-only";

import {
  AppError
} from "@/lib/server/errors";

import {
  resolveActiveYearRoute
} from "@/lib/server/registry";

import type {
  SessionContext
} from "@/lib/server/session";


type UnknownRecord =
  Record<string, unknown>;


export type AppsScriptAnnualRoute = {
  projectId:
    string;

  locationId:
    string;

  year:
    number;

  status:
    "ACTIVE";

  spreadsheetId:
    string;

  schemaVersion:
    string;
};


const SPREADSHEET_ID_KEYS = [
  "spreadsheetId",
  "spreadsheet_id",
  "googleSpreadsheetId",
  "google_spreadsheet_id",
  "googleSheetId",
  "google_sheet_id",
  "workbookId",
  "workbook_id",
  "fileId",
  "file_id"
] as const;


const SCHEMA_VERSION_KEYS = [
  "schemaVersion",
  "schema_version"
] as const;


const STATUS_KEYS = [
  "status",
  "routeStatus",
  "route_status",
  "lifecycleStatus",
  "lifecycle_status",
  "state"
] as const;


const PROJECT_ID_KEYS = [
  "projectId",
  "project_id"
] as const;


const LOCATION_ID_KEYS = [
  "locationId",
  "location_id"
] as const;


const YEAR_KEYS = [
  "year",
  "activeYear",
  "active_year"
] as const;


const NESTED_ROUTE_KEYS = [
  "route",
  "annualRoute",
  "annual_route",
  "yearRoute",
  "year_route",
  "workbook",
  "registry",
  "data"
] as const;


/****************************************************
 * GENERIC RECORD HELPERS
 ****************************************************/

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


function findStringByKeys(
  value:
    unknown,

  keys:
    readonly string[],

  depth =
    0
): string | null {
  if (
    depth > 4 ||
    !isRecord(
      value
    )
  ) {
    return null;
  }


  for (
    const key of keys
  ) {
    const candidate =
      value[
        key
      ];


    if (
      typeof candidate ===
        "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }


  for (
    const nestedKey of
      NESTED_ROUTE_KEYS
  ) {
    if (
      !(nestedKey in value)
    ) {
      continue;
    }


    const found =
      findStringByKeys(
        value[
          nestedKey
        ],
        keys,
        depth + 1
      );


    if (
      found
    ) {
      return found;
    }
  }


  return null;
}


function findNumberByKeys(
  value:
    unknown,

  keys:
    readonly string[],

  depth =
    0
): number | null {
  if (
    depth > 4 ||
    !isRecord(
      value
    )
  ) {
    return null;
  }


  for (
    const key of keys
  ) {
    const candidate =
      value[
        key
      ];


    if (
      typeof candidate ===
        "number" &&
      Number.isFinite(
        candidate
      )
    ) {
      return candidate;
    }


    if (
      typeof candidate ===
        "string" &&
      candidate.trim()
    ) {
      const parsed =
        Number(
          candidate
        );


      if (
        Number.isFinite(
          parsed
        )
      ) {
        return parsed;
      }
    }
  }


  for (
    const nestedKey of
      NESTED_ROUTE_KEYS
  ) {
    if (
      !(nestedKey in value)
    ) {
      continue;
    }


    const found =
      findNumberByKeys(
        value[
          nestedKey
        ],
        keys,
        depth + 1
      );


    if (
      found !== null
    ) {
      return found;
    }
  }


  return null;
}


/****************************************************
 * TRUSTED ANNUAL ROUTE PROBE
 ****************************************************/

function buildAnnualRouteProbeDate(
  activeYear:
    number
): string {
  if (
    !Number.isInteger(
      activeYear
    ) ||
    activeYear < 2000 ||
    activeYear > 2100
  ) {
    throw new AppError({
      status:
        500,

      code:
        "INVALID_ACTIVE_YEAR",

      userMessage:
        "Некоректно визначено активний обліковий рік.",

      technicalMessage:
        `Invalid activeYear: ${String(
          activeYear
        )}.`,

      retryable:
        false
    });
  }


  /*
   * Стабільна дата всередині
   * активного облікового року.
   *
   * Не залежить від timezone
   * та переходу 31.12 / 01.01.
   */
  return `${String(
    activeYear
  )}-07-01`;
}


/****************************************************
 * RESOLVE TRUSTED ACTIVE ANNUAL ROUTE
 ****************************************************/

export async function resolveAppsScriptAnnualRoute(
  context:
    SessionContext,

  operationDate?:
    string | null
): Promise<AppsScriptAnnualRoute> {
  const routeDate =
    operationDate?.trim() ||
    buildAnnualRouteProbeDate(
      context.activeYear
    );


  const routeDateMatch =
    routeDate.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );


  if (
    !routeDateMatch
  ) {
    throw new AppError({
      status:
        400,

      code:
        "INVALID_OPERATION_DATE",

      userMessage:
        "Некоректна дата операції.",

      technicalMessage:
        "operationDate must use YYYY-MM-DD.",

      retryable:
        false
    });
  }


  if (
    Number(
      routeDateMatch[1]
    ) !==
      context.activeYear
  ) {
    throw new AppError({
      status:
        409,

      code:
        "OPERATION_YEAR_MISMATCH",

      userMessage:
        "Дата операції не належить активному обліковому року.",

      technicalMessage:
        `operationDate=${routeDate}, activeYear=${context.activeYear}.`,

      retryable:
        false
    });
  }


  const resolved =
    await resolveActiveYearRoute(
      context,
      routeDate
    );


  /**************************************************
   * SPREADSHEET ID
   **************************************************/

  const spreadsheetId =
    findStringByKeys(
      resolved,
      SPREADSHEET_ID_KEYS
    );


  if (
    !spreadsheetId
  ) {
    throw new AppError({
      status:
        503,

      code:
        "ACTIVE_YEAR_SPREADSHEET_MISSING",

      userMessage:
        "Для активного року не налаштовано робочу таблицю.",

      technicalMessage:
        "resolveActiveYearRoute returned no spreadsheetId.",

      retryable:
        false
    });
  }


  /**************************************************
   * SCHEMA VERSION
   **************************************************/

  const schemaVersion =
    findStringByKeys(
      resolved,
      SCHEMA_VERSION_KEYS
    );


  if (
    !schemaVersion
  ) {
    throw new AppError({
      status:
        503,

      code:
        "ACTIVE_YEAR_SCHEMA_VERSION_MISSING",

      userMessage:
        "Для активного року не визначено версію структури.",

      technicalMessage:
        "resolveActiveYearRoute returned no schemaVersion.",

      retryable:
        false
    });
  }


  /**************************************************
   * STATUS
   **************************************************/

  const registryStatus =
    findStringByKeys(
      resolved,
      STATUS_KEYS
    );


  if (
    registryStatus &&
    registryStatus
      .trim()
      .toUpperCase() !==
        "ACTIVE"
  ) {
    throw new AppError({
      status:
        409,

      code:
        "ANNUAL_ROUTE_NOT_ACTIVE",

      userMessage:
        "Обліковий рік не активний для запису.",

      technicalMessage:
        `Expected ACTIVE route, got ${registryStatus}.`,

      retryable:
        false
    });
  }


  /**************************************************
   * PROJECT
   **************************************************/

  const registryProjectId =
    findStringByKeys(
      resolved,
      PROJECT_ID_KEYS
    );


  if (
    registryProjectId &&
    registryProjectId !==
      context.projectId
  ) {
    throw new AppError({
      status:
        409,

      code:
        "ANNUAL_ROUTE_PROJECT_MISMATCH",

      userMessage:
        "Активний маршрут не відповідає поточному проєкту.",

      technicalMessage:
        "year_registry projectId does not match SessionContext.",

      retryable:
        false
    });
  }


  /**************************************************
   * LOCATION
   **************************************************/

  const registryLocationId =
    findStringByKeys(
      resolved,
      LOCATION_ID_KEYS
    );


  if (
    registryLocationId &&
    registryLocationId !==
      context.locationId
  ) {
    throw new AppError({
      status:
        409,

      code:
        "ANNUAL_ROUTE_LOCATION_MISMATCH",

      userMessage:
        "Активний маршрут не відповідає поточній локації.",

      technicalMessage:
        "year_registry locationId does not match SessionContext.",

      retryable:
        false
    });
  }


  /**************************************************
   * YEAR
   **************************************************/

  const registryYear =
    findNumberByKeys(
      resolved,
      YEAR_KEYS
    );


  if (
    registryYear !== null &&
    registryYear !==
      context.activeYear
  ) {
    throw new AppError({
      status:
        409,

      code:
        "ANNUAL_ROUTE_YEAR_MISMATCH",

      userMessage:
        "Активний маршрут не відповідає поточному року.",

      technicalMessage:
        `Session year=${context.activeYear}, registry year=${registryYear}.`,

      retryable:
        false
    });
  }


  return {
    projectId:
      context.projectId,

    locationId:
      context.locationId,

    year:
      context.activeYear,

    status:
      "ACTIVE",

    spreadsheetId,

    schemaVersion
  };
}