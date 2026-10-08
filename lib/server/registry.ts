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


export type YearRouteMode =
  | "PRODUCTION"
  | "TEST";


export type YearRouteStatus =
  | "ACTIVE"
  | "READY";


export type YearRoute = {
  projectId: string;

  locationId: string;

  financialYear: number;

  spreadsheetId: string;

  schemaVersion: string;

  status:
    YearRouteStatus;

  routeMode:
    YearRouteMode;

  appsScriptWebAppUrl:
    string | null;
};


export type SessionRouteOption = {
  locationId: string;

  locationName: string;

  financialYear: number;

  routeMode:
    YearRouteMode;

  routeStatus:
    YearRouteStatus;

  isCurrent: boolean;
};


function isUsableRoute(
  routeMode: YearRouteMode,
  status: string
): status is YearRouteStatus {
  if (
    routeMode ===
      "PRODUCTION"
  ) {
    return (
      status ===
      "ACTIVE"
    );
  }


  return (
    status ===
      "READY" ||
    status ===
      "ACTIVE"
  );
}


export async function listSessionRouteOptions(
  context: SessionContext
): Promise<SessionRouteOption[]> {
  const sql =
    db();


  const rows =
    await sql`
      SELECT
        l.location_id AS
          "locationId",

        l.name AS
          "locationName",

        yr.financial_year AS
          "financialYear",

        yr.route_mode AS
          "routeMode",

        yr.status AS
          "routeStatus"

      FROM user_locations ul

      INNER JOIN locations l
        ON l.project_id =
           ul.project_id

        AND l.location_id =
            ul.location_id

        AND l.status =
            'ACTIVE'

      INNER JOIN projects p
        ON p.project_id =
           ul.project_id

        AND p.status =
            'ACTIVE'

      INNER JOIN year_registry yr
        ON yr.project_id =
           ul.project_id

        AND yr.location_id =
            ul.location_id

        AND yr.financial_year =
            p.active_year

      WHERE
        ul.user_id =
          ${context.userId}

        AND ul.project_id =
          ${context.projectId}

        AND p.active_year =
          ${context.activeYear}

        AND (
          (
            yr.route_mode =
              'PRODUCTION'

            AND yr.status =
              'ACTIVE'
          )

          OR

          (
            yr.route_mode =
              'TEST'

            AND yr.status IN (
              'READY',
              'ACTIVE'
            )
          )
        )

      ORDER BY
        CASE
          WHEN yr.route_mode =
            'PRODUCTION'
          THEN 0
          ELSE 1
        END,

        l.name
    `;


  return rows.map(
    raw => {
      const row =
        raw as unknown as {
          locationId: string;

          locationName: string;

          financialYear: number;

          routeMode:
            YearRouteMode;

          routeStatus:
            YearRouteStatus;
        };


      return {
        locationId:
          row.locationId,

        locationName:
          row.locationName,

        financialYear:
          Number(
            row.financialYear
          ),

        routeMode:
          row.routeMode,

        routeStatus:
          row.routeStatus,

        isCurrent:
          row.locationId ===
            context.locationId
      };
    }
  );
}


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
      status:
        400,

      code:
        "INVALID_OPERATION_DATE",

      userMessage:
        "Некоректна дата операції."
    });
  }


  const financialYear =
    Number(
      operationDate.slice(
        0,
        4
      )
    );


  if (
    !Number.isInteger(
      financialYear
    )
  ) {
    throw new AppError({
      status:
        400,

      code:
        "INVALID_FINANCIAL_YEAR",

      userMessage:
        "Некоректний обліковий рік."
    });
  }


  const sql =
    db();


  /*
   * Важливо:
   *
   * projectId і locationId
   * беруться ВИКЛЮЧНО
   * із session context.
   *
   * spreadsheetId браузер
   * не передає.
   */

  const rows =
    await sql`
      SELECT
        yr.project_id AS
          "projectId",

        yr.location_id AS
          "locationId",

        yr.financial_year AS
          "financialYear",

        yr.spreadsheet_id AS
          "spreadsheetId",

        yr.schema_version AS
          "schemaVersion",

        yr.status AS
          "status",

        yr.route_mode AS
          "routeMode",

        yr.apps_script_web_app_url AS
          "appsScriptWebAppUrl"

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

        AND p.status =
          'ACTIVE'

        AND (
          (
            yr.route_mode =
              'PRODUCTION'

            AND yr.status =
              'ACTIVE'
          )

          OR

          (
            yr.route_mode =
              'TEST'

            AND yr.status IN (
              'READY',
              'ACTIVE'
            )
          )
        )

      LIMIT 1
    `;


  const row =
    rows[0] as unknown as
      | {
          projectId: string;

          locationId: string;

          financialYear: number;

          spreadsheetId: string;

          schemaVersion: string;

          status: string;

          routeMode:
            YearRouteMode;

          appsScriptWebAppUrl:
            string | null;
        }
      | undefined;


  if (
    !row ||
    !isUsableRoute(
      row.routeMode,
      row.status
    )
  ) {
    throw new AppError({
      status:
        409,

      code:
        "YEAR_NOT_ACTIVE",

      userMessage:
        "Для цієї дати немає доступного облікового маршруту."
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
      row.status,

    routeMode:
      row.routeMode,

    appsScriptWebAppUrl:
      row
        .appsScriptWebAppUrl
        ?.trim() ||
      null
  };
}