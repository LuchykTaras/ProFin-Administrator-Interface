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


export type YearRoute = {
  projectId: string;
  locationId: string;

  financialYear: number;

  spreadsheetId: string;

  schemaVersion: string;

  status: "ACTIVE";
};


export async function resolveActiveYearRoute(
  context: SessionContext,
  operationDate: string
): Promise<YearRoute> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      operationDate
    )
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_OPERATION_DATE",
      userMessage:
        "Некоректна дата операції."
    });
  }

  const financialYear =
    Number(
      operationDate.slice(0, 4)
    );

  if (
    !Number.isInteger(
      financialYear
    )
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_FINANCIAL_YEAR",
      userMessage:
        "Некоректний обліковий рік."
    });
  }

  const sql = db();

  /*
   * Важливо:
   *
   * projectId і locationId
   * беруться ВИКЛЮЧНО із session context.
   *
   * spreadsheetId браузер не передає.
   */

  const rows = await sql`
    SELECT
      yr.project_id AS "projectId",

      yr.location_id AS "locationId",

      yr.financial_year AS
        "financialYear",

      yr.spreadsheet_id AS
        "spreadsheetId",

      yr.schema_version AS
        "schemaVersion",

      yr.status AS "status"

    FROM year_registry yr

    INNER JOIN projects p
      ON p.project_id =
         yr.project_id

    WHERE
      yr.project_id =
        ${context.projectId}

      AND yr.location_id =
        ${context.locationId}

      AND yr.financial_year =
        ${financialYear}

      AND p.active_year =
        ${financialYear}

      AND p.status = 'ACTIVE'

      AND yr.status = 'ACTIVE'

    LIMIT 1
  `;

  const row =
    rows[0] as
      | {
          projectId: string;
          locationId: string;
          financialYear: number;
          spreadsheetId: string;
          schemaVersion: string;
          status: "ACTIVE";
        }
      | undefined;

  if (!row) {
    throw new AppError({
      status: 409,
      code: "YEAR_NOT_ACTIVE",
      userMessage:
        "Для цієї дати немає активного облікового року."
    });
  }

  return {
    projectId:
      row.projectId,

    locationId:
      row.locationId,

    financialYear:
      Number(
        row.financialYear
      ),

    spreadsheetId:
      row.spreadsheetId,

    schemaVersion:
      row.schemaVersion,

    status:
      "ACTIVE"
  };
}