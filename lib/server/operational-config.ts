import "server-only";

import {
  db
} from "@/lib/server/db";
import {
  AppError
} from "@/lib/server/errors";
import type {
  SessionContext
} from "@/lib/server/session";

export type TrustedTransferRoute = {
  routeId: string;
  projectId: string;
  year: number;

  sourceLocationId: string;
  sourceLocationName: string;
  sourceCode: string;
  sourceSpreadsheetId: string;
  sourceSchemaVersion: string;

  destinationLocationId: string;
  destinationLocationName: string;
  destinationCode: string;
  destinationSpreadsheetId: string;
  destinationSchemaVersion: string;

  status: "ACTIVE";
};

export type TrustedShiftPolicy = {
  locationName: string;
  cashAccounts: string[];
  openingBalance: number | null;
  collectionOperationTypes: string[];
  postedStatuses: string[];
  discrepancyTolerance: number;
  blockOnProblemOperations: boolean;
  helsiRequired: boolean;
};

type TransferDirection =
  | "OUTGOING"
  | "INCOMING";

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function stringArray(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .map(item => item.trim())
    .filter(Boolean);
}

export async function resolveTrustedTransferRoute(
  context: SessionContext,
  routeId: string,
  direction: TransferDirection
): Promise<TrustedTransferRoute> {
  const normalizedRouteId =
    routeId.trim();

  if (!normalizedRouteId) {
    throw new AppError({
      status: 400,
      code: "TRANSFER_ROUTE_REQUIRED",
      userMessage:
        "Не вибрано дозволений маршрут переміщення."
    });
  }

  const sql = db();

  const rows =
    direction === "OUTGOING"
      ? await sql`
          SELECT
            tr.route_id AS "routeId",
            tr.project_id AS "projectId",
            tr.financial_year AS "year",

            tr.source_location_id AS "sourceLocationId",
            src.name AS "sourceLocationName",
            tr.source_code AS "sourceCode",
            srcyr.spreadsheet_id AS "sourceSpreadsheetId",
            srcyr.schema_version AS "sourceSchemaVersion",

            tr.destination_location_id AS "destinationLocationId",
            dst.name AS "destinationLocationName",
            tr.destination_code AS "destinationCode",
            dstyr.spreadsheet_id AS "destinationSpreadsheetId",
            dstyr.schema_version AS "destinationSchemaVersion",

            tr.status AS "status"

          FROM transfer_routes tr
          INNER JOIN projects p
            ON p.project_id = tr.project_id
            AND p.status = 'ACTIVE'
            AND p.active_year = tr.financial_year
          INNER JOIN locations src
            ON src.project_id = tr.project_id
            AND src.location_id = tr.source_location_id
            AND src.status = 'ACTIVE'
          INNER JOIN locations dst
            ON dst.project_id = tr.project_id
            AND dst.location_id = tr.destination_location_id
            AND dst.status = 'ACTIVE'
          INNER JOIN year_registry srcyr
            ON srcyr.project_id = tr.project_id
            AND srcyr.location_id = tr.source_location_id
            AND srcyr.financial_year = tr.financial_year
            AND srcyr.status = 'ACTIVE'
          INNER JOIN year_registry dstyr
            ON dstyr.project_id = tr.project_id
            AND dstyr.location_id = tr.destination_location_id
            AND dstyr.financial_year = tr.financial_year
            AND dstyr.status = 'ACTIVE'
          WHERE
            tr.route_id = ${normalizedRouteId}
            AND tr.project_id = ${context.projectId}
            AND tr.financial_year = ${context.activeYear}
            AND tr.source_location_id = ${context.locationId}
            AND tr.status = 'ACTIVE'
          LIMIT 1
        `
      : await sql`
          SELECT
            tr.route_id AS "routeId",
            tr.project_id AS "projectId",
            tr.financial_year AS "year",

            tr.source_location_id AS "sourceLocationId",
            src.name AS "sourceLocationName",
            tr.source_code AS "sourceCode",
            srcyr.spreadsheet_id AS "sourceSpreadsheetId",
            srcyr.schema_version AS "sourceSchemaVersion",

            tr.destination_location_id AS "destinationLocationId",
            dst.name AS "destinationLocationName",
            tr.destination_code AS "destinationCode",
            dstyr.spreadsheet_id AS "destinationSpreadsheetId",
            dstyr.schema_version AS "destinationSchemaVersion",

            tr.status AS "status"

          FROM transfer_routes tr
          INNER JOIN projects p
            ON p.project_id = tr.project_id
            AND p.status = 'ACTIVE'
            AND p.active_year = tr.financial_year
          INNER JOIN locations src
            ON src.project_id = tr.project_id
            AND src.location_id = tr.source_location_id
            AND src.status = 'ACTIVE'
          INNER JOIN locations dst
            ON dst.project_id = tr.project_id
            AND dst.location_id = tr.destination_location_id
            AND dst.status = 'ACTIVE'
          INNER JOIN year_registry srcyr
            ON srcyr.project_id = tr.project_id
            AND srcyr.location_id = tr.source_location_id
            AND srcyr.financial_year = tr.financial_year
            AND srcyr.status = 'ACTIVE'
          INNER JOIN year_registry dstyr
            ON dstyr.project_id = tr.project_id
            AND dstyr.location_id = tr.destination_location_id
            AND dstyr.financial_year = tr.financial_year
            AND dstyr.status = 'ACTIVE'
          WHERE
            tr.route_id = ${normalizedRouteId}
            AND tr.project_id = ${context.projectId}
            AND tr.financial_year = ${context.activeYear}
            AND tr.destination_location_id = ${context.locationId}
            AND tr.status = 'ACTIVE'
          LIMIT 1
        `;

  const row = rows[0] as
    | TrustedTransferRoute
    | undefined;

  if (!row) {
    throw new AppError({
      status: 404,
      code: "TRANSFER_ROUTE_NOT_ALLOWED",
      userMessage:
        "Цей маршрут переміщення недоступний для поточної локації."
    });
  }

  return {
    ...row,
    year: Number(row.year),
    status: "ACTIVE"
  };
}

export type TransferRouteOption = {
  routeId: string;
  direction: TransferDirection;
  counterpartyLocationId: string;
  counterpartyLocationName: string;
  counterpartyCode: string;
};

export async function listTrustedTransferRoutes(
  context: SessionContext
): Promise<TransferRouteOption[]> {
  const sql = db();

  const rows = await sql`
    SELECT
      tr.route_id AS "routeId",
      tr.source_location_id AS "sourceLocationId",
      src.name AS "sourceLocationName",
      tr.source_code AS "sourceCode",
      tr.destination_location_id AS "destinationLocationId",
      dst.name AS "destinationLocationName",
      tr.destination_code AS "destinationCode"
    FROM transfer_routes tr
    INNER JOIN projects p
      ON p.project_id = tr.project_id
      AND p.status = 'ACTIVE'
      AND p.active_year = tr.financial_year
    INNER JOIN locations src
      ON src.project_id = tr.project_id
      AND src.location_id = tr.source_location_id
      AND src.status = 'ACTIVE'
    INNER JOIN locations dst
      ON dst.project_id = tr.project_id
      AND dst.location_id = tr.destination_location_id
      AND dst.status = 'ACTIVE'
    INNER JOIN year_registry srcyr
      ON srcyr.project_id = tr.project_id
      AND srcyr.location_id = tr.source_location_id
      AND srcyr.financial_year = tr.financial_year
      AND srcyr.status = 'ACTIVE'
    INNER JOIN year_registry dstyr
      ON dstyr.project_id = tr.project_id
      AND dstyr.location_id = tr.destination_location_id
      AND dstyr.financial_year = tr.financial_year
      AND dstyr.status = 'ACTIVE'
    WHERE
      tr.project_id = ${context.projectId}
      AND tr.financial_year = ${context.activeYear}
      AND tr.status = 'ACTIVE'
      AND (
        tr.source_location_id = ${context.locationId}
        OR tr.destination_location_id = ${context.locationId}
      )
    ORDER BY tr.route_id
  `;

  return rows.map((raw) => {
    const row = raw as {
      routeId: string;
      sourceLocationId: string;
      sourceLocationName: string;
      sourceCode: string;
      destinationLocationId: string;
      destinationLocationName: string;
      destinationCode: string;
    };

    if (row.sourceLocationId === context.locationId) {
      return {
        routeId: row.routeId,
        direction: "OUTGOING" as const,
        counterpartyLocationId:
          row.destinationLocationId,
        counterpartyLocationName:
          row.destinationLocationName,
        counterpartyCode:
          row.destinationCode
      };
    }

    return {
      routeId: row.routeId,
      direction: "INCOMING" as const,
      counterpartyLocationId:
        row.sourceLocationId,
      counterpartyLocationName:
        row.sourceLocationName,
      counterpartyCode:
        row.sourceCode
    };
  });
}

export async function resolveTrustedShiftPolicy(
  context: SessionContext
): Promise<TrustedShiftPolicy> {
  const sql = db();

  const rows = await sql`
    SELECT
      yr.cash_accounts AS "cashAccounts",
      yr.shift_policy AS "shiftPolicy"
    FROM year_registry yr
    INNER JOIN projects p
      ON p.project_id = yr.project_id
      AND p.status = 'ACTIVE'
      AND p.active_year = yr.financial_year
    WHERE
      yr.project_id = ${context.projectId}
      AND yr.location_id = ${context.locationId}
      AND yr.financial_year = ${context.activeYear}
      AND yr.status = 'ACTIVE'
    LIMIT 1
  `;

  const row = rows[0] as
    | {
        cashAccounts?: unknown;
        shiftPolicy?: unknown;
      }
    | undefined;

  if (!row) {
    throw new AppError({
      status: 409,
      code: "SHIFT_YEAR_ROUTE_NOT_ACTIVE",
      userMessage:
        "Активний річний контур для закриття зміни не знайдено."
    });
  }

  const cashAccounts =
    stringArray(row.cashAccounts);

  if (!cashAccounts.length) {
    throw new AppError({
      status: 409,
      code: "SHIFT_CASH_ACCOUNTS_NOT_CONFIGURED",
      userMessage:
        "Для локації не налаштовано касові рахунки."
    });
  }

  const rawPolicy =
    isRecord(row.shiftPolicy)
      ? row.shiftPolicy
      : {};

  const collectionOperationTypes =
    stringArray(
      rawPolicy.collectionOperationTypes
    );

  const postedStatuses =
    stringArray(
      rawPolicy.postedStatuses
    );

  if (
    !collectionOperationTypes.length ||
    !postedStatuses.length
  ) {
    throw new AppError({
      status: 409,
      code: "SHIFT_POLICY_INCOMPLETE",
      userMessage:
        "Політика закриття зміни налаштована не повністю."
    });
  }

  const openingBalance =
    typeof rawPolicy.openingBalance === "number" &&
    Number.isFinite(rawPolicy.openingBalance)
      ? rawPolicy.openingBalance
      : null;

  const discrepancyTolerance =
    typeof rawPolicy.discrepancyTolerance === "number" &&
    Number.isFinite(rawPolicy.discrepancyTolerance) &&
    rawPolicy.discrepancyTolerance >= 0
      ? rawPolicy.discrepancyTolerance
      : 0.01;

  return {
    locationName: context.locationName,
    cashAccounts,
    openingBalance,
    collectionOperationTypes,
    postedStatuses,
    discrepancyTolerance,
    blockOnProblemOperations:
      rawPolicy.blockOnProblemOperations === true,
    helsiRequired:
      rawPolicy.helsiRequired !== false
  };
}