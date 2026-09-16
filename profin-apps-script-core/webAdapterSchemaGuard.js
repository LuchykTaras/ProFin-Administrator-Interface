/****************************************************
 * PROFIN OS
 * WEB ADAPTER
 * TRUSTED ANNUAL ROUTE + SCHEMA GUARD
 * --------------------------------------------------
 * PATCH 36
 *
 * Гарантує:
 *
 * 1. project/location/year походять
 *    із підписаного server context;
 *
 * 2. route має ACTIVE;
 *
 * 3. spreadsheetId походить із
 *    підписаного annualRoute;
 *
 * 4. Apps Script відкриває тільки
 *    цей workbook;
 *
 * 5. критична структура workbook
 *    перевіряється ДО domain write;
 *
 * 6. системні аркуші можуть мати
 *    випадкові пробіли на початку
 *    або в кінці фізичної назви.
 *
 * ВАЖЛИВО:
 * PATCH 36 НЕ перейменовує аркуші.
 ****************************************************/


var PROFIN_WEB_ADAPTER_SCHEMA_VERSION =
  'PROFIN_WEB_ADAPTER_SCHEMA_PATCH_36_2026';


var PROFIN_WEB_ADAPTER_ROUTE_VERSION =
  'PROFIN_WEB_ADAPTER_ANNUAL_ROUTE_PATCH_33_2026';


/****************************************************
 * CORE SCHEMA CONTRACT
 ****************************************************/

var PROFIN_WEB_ADAPTER_REQUIRED_SHEETS = [
  {
    name:
      'Ввід операцій',

    minColumns:
      1,

    minRows:
      1
  },

  {
    name:
      'База операцій',

    minColumns:
      31,

    minRows:
      10
  },

  {
    name:
      'Нарахування',

    minColumns:
      1,

    minRows:
      1
  },

  {
    name:
      'Мапінг',

    minColumns:
      1,

    minRows:
      1
  },

  {
    name:
      'Довідник',

    minColumns:
      1,

    minRows:
      1
  },

  {
    name:
      'Склад медичних запасів',

    minColumns:
      1,

    minRows:
      1
  },

  {
    name:
      'Взаєморозрахунки філій',

    minColumns:
      1,

    minRows:
      1
  }
];


/*
 * У "База операцій":
 *
 * row 9  = contract/header row
 * row 10 = business data start
 *
 * Перевіряємо критичні колонки,
 * які використовує чинний core.
 */
var PROFIN_WEB_ADAPTER_BASE_HEADER_ROW =
  9;


var PROFIN_WEB_ADAPTER_BASE_CRITICAL_COLUMNS = [
  1,
  4,
  7,
  10,
  11,
  12,
  30
];


/****************************************************
 * TRUSTED ANNUAL ROUTE
 ****************************************************/

function profinWebAdapterResolveTrustedAnnualRoute_(
  request
) {
  if (
    !request ||
    !request.context ||
    typeof request.context !==
      'object'
  ) {
    throw profinWebAdapterError_(
      400,
      'TRUSTED_CONTEXT_REQUIRED',
      'Відсутній захищений контекст маршруту.',
      'request.context is required.',
      false
    );
  }


  var context =
    request.context;


  var route =
    context.annualRoute;


  if (
    !route ||
    typeof route !==
      'object' ||
    Array.isArray(
      route
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'ANNUAL_ROUTE_REQUIRED',
      'Відсутній маршрут активного року.',
      'context.annualRoute is required.',
      false
    );
  }


  profinWebAdapterSchemaRequireString_(
    route,
    'projectId'
  );


  profinWebAdapterSchemaRequireString_(
    route,
    'locationId'
  );


  profinWebAdapterSchemaRequireString_(
    route,
    'status'
  );


  profinWebAdapterSchemaRequireString_(
    route,
    'spreadsheetId'
  );


  profinWebAdapterSchemaRequireString_(
    route,
    'schemaVersion'
  );


  if (
    typeof route.year !==
      'number' ||
    !isFinite(
      route.year
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'ANNUAL_ROUTE_YEAR_REQUIRED',
      'Некоректний рік annual route.',
      'annualRoute.year must be a number.',
      false
    );
  }


  /*
   * ROUTE MUST BE ACTIVE.
   */
  if (
    String(
      route.status
    )
      .trim()
      .toUpperCase() !==
        'ACTIVE'
  ) {
    throw profinWebAdapterError_(
      409,
      'ANNUAL_ROUTE_NOT_ACTIVE',
      'Поточний рік не активний для операцій.',
      'annualRoute.status must be ACTIVE.',
      false
    );
  }


  /*
   * Route identity must exactly match
   * trusted signed context.
   */
  if (
    route.projectId !==
      context.projectId
  ) {
    throw profinWebAdapterError_(
      409,
      'ANNUAL_ROUTE_PROJECT_MISMATCH',
      'Маршрут не відповідає поточному проєкту.',
      'annualRoute.projectId differs from context.projectId.',
      false
    );
  }


  if (
    route.locationId !==
      context.locationId
  ) {
    throw profinWebAdapterError_(
      409,
      'ANNUAL_ROUTE_LOCATION_MISMATCH',
      'Маршрут не відповідає поточній локації.',
      'annualRoute.locationId differs from context.locationId.',
      false
    );
  }


  if (
    Number(
      route.year
    ) !==
      Number(
        context.activeYear
      )
  ) {
    throw profinWebAdapterError_(
      409,
      'ANNUAL_ROUTE_YEAR_MISMATCH',
      'Маршрут не відповідає активному року.',
      'annualRoute.year differs from context.activeYear.',
      false
    );
  }


  /*
   * HMAC already verified before this function.
   *
   * Therefore spreadsheetId here
   * is server-selected and signed.
   */
  var spreadsheet;


  try {
    spreadsheet =
      SpreadsheetApp.openById(
        route.spreadsheetId
      );

  } catch (error) {
    throw profinWebAdapterError_(
      503,
      'ANNUAL_WORKBOOK_OPEN_FAILED',
      'Не вдалося відкрити активну річну таблицю.',
      error &&
      error.message
        ? error.message
        : String(
            error
          ),
      true
    );
  }


  if (
    !spreadsheet ||
    spreadsheet.getId() !==
      route.spreadsheetId
  ) {
    throw profinWebAdapterError_(
      409,
      'ANNUAL_WORKBOOK_ID_MISMATCH',
      'Відкрито некоректну річну таблицю.',
      'Opened spreadsheet ID differs from signed annual route.',
      false
    );
  }


  return {
    spreadsheet:
      spreadsheet,

    /*
     * У response НЕ повертаємо
     * spreadsheetId.
     *
     * Він залишається server-side.
     */
    info: {
      version:
        PROFIN_WEB_ADAPTER_ROUTE_VERSION,

      projectId:
        context.projectId,

      locationId:
        context.locationId,

      year:
        context.activeYear,

      status:
        'ACTIVE',

      schemaVersion:
        route.schemaVersion
    }
  };
}


/****************************************************
 * PATCH 36
 * SAFE SHEET LOOKUP
 ****************************************************/

/*
 * Спочатку шукаємо аркуш
 * за ТОЧНОЮ системною назвою.
 *
 * Якщо його немає:
 *
 *   "Мапінг"
 *
 * також може знайти фізичний лист:
 *
 *   "Мапінг "
 *
 * або:
 *
 *   " Мапінг"
 *
 * Сам workbook при цьому
 * НЕ змінюється.
 */
function profinWebAdapterFindSheetByContractName_(
  spreadsheet,
  contractName
) {
  if (
    !spreadsheet
  ) {
    return null;
  }


  var expectedName =
    String(
      contractName || ''
    );


  if (
    !expectedName.trim()
  ) {
    return null;
  }


  /*
   * 1. Exact lookup first.
   *
   * Це зберігає стандартну поведінку
   * для всіх коректно названих листів.
   */
  var exactSheet =
    spreadsheet.getSheetByName(
      expectedName
    );


  if (
    exactSheet
  ) {
    return exactSheet;
  }


  /*
   * 2. Compatibility fallback.
   *
   * Порівнюємо лише після trim().
   * Внутрішні пробіли НЕ змінюємо.
   */
  var normalizedExpectedName =
    expectedName.trim();


  var sheets =
    spreadsheet.getSheets();


  for (
    var i = 0;
    i < sheets.length;
    i++
  ) {
    var candidate =
      sheets[
        i
      ];


    if (
      !candidate
    ) {
      continue;
    }


    var candidateName =
      String(
        candidate.getName()
      );


    if (
      candidateName.trim() ===
        normalizedExpectedName
    ) {
      return candidate;
    }
  }


  return null;
}


/****************************************************
 * CORE SCHEMA GUARD
 ****************************************************/

function profinWebAdapterAssertCoreSchema_(
  spreadsheet
) {
  if (
    !spreadsheet
  ) {
    throw profinWebAdapterError_(
      500,
      'SCHEMA_SPREADSHEET_REQUIRED',
      'Не вдалося перевірити структуру таблиці.',
      'Spreadsheet instance is missing.',
      false
    );
  }


  var checkedSheets =
    [];


  for (
    var i = 0;
    i <
      PROFIN_WEB_ADAPTER_REQUIRED_SHEETS.length;
    i++
  ) {
    var contract =
      PROFIN_WEB_ADAPTER_REQUIRED_SHEETS[
        i
      ];


    /*
     * PATCH 36:
     *
     * Не використовуємо тільки
     * spreadsheet.getSheetByName().
     *
     * Спочатку exact lookup,
     * потім trim-compatible fallback.
     */
    var sheet =
      profinWebAdapterFindSheetByContractName_(
        spreadsheet,
        contract.name
      );


    if (
      !sheet
    ) {
      throw profinWebAdapterError_(
        409,
        'SCHEMA_REQUIRED_SHEET_MISSING',
        'Структура робочої таблиці не відповідає системному контракту.',
        'Required sheet missing: ' +
          contract.name,
        false
      );
    }


    if (
      sheet.getMaxColumns() <
        contract.minColumns
    ) {
      throw profinWebAdapterError_(
        409,
        'SCHEMA_COLUMNS_MISMATCH',
        'Структура робочої таблиці пошкоджена.',
        contract.name +
          ': expected at least ' +
          contract.minColumns +
          ' columns, got ' +
          sheet.getMaxColumns() +
          '.',
        false
      );
    }


    if (
      sheet.getMaxRows() <
        contract.minRows
    ) {
      throw profinWebAdapterError_(
        409,
        'SCHEMA_ROWS_MISMATCH',
        'Структура робочої таблиці пошкоджена.',
        contract.name +
          ': expected at least ' +
          contract.minRows +
          ' rows, got ' +
          sheet.getMaxRows() +
          '.',
        false
      );
    }


    checkedSheets.push(
      contract.name
    );
  }


  /*
   * Додаткова перевірка
   * "База операцій".
   *
   * PATCH 36:
   * використовуємо той самий
   * safe lookup.
   */
  var baseSheet =
    profinWebAdapterFindSheetByContractName_(
      spreadsheet,
      'База операцій'
    );


  if (
    !baseSheet
  ) {
    throw profinWebAdapterError_(
      409,
      'SCHEMA_REQUIRED_SHEET_MISSING',
      'Структура робочої таблиці не відповідає системному контракту.',
      'Required sheet missing: База операцій',
      false
    );
  }


  /*
   * STABLE BASELINE
   *
   * Перевіряємо ті самі критичні колонки
   * окремими read-викликами, як до performance patch.
   * Логіка schema guard не змінюється.
   */
  for (
    var c = 0;
    c <
      PROFIN_WEB_ADAPTER_BASE_CRITICAL_COLUMNS.length;
    c++
  ) {
    var columnNumber =
      PROFIN_WEB_ADAPTER_BASE_CRITICAL_COLUMNS[
        c
      ];


    var header =
      baseSheet
        .getRange(
          PROFIN_WEB_ADAPTER_BASE_HEADER_ROW,
          columnNumber
        )
        .getDisplayValue();


    if (
      typeof header !==
        'string' ||
      !header.trim()
    ) {
      throw profinWebAdapterError_(
        409,
        'SCHEMA_BASE_HEADER_MISSING',
        'Структура Бази операцій не відповідає системному контракту.',
        'Missing header at База операцій!' +
          columnNumber +
          ', header row ' +
          PROFIN_WEB_ADAPTER_BASE_HEADER_ROW +
          '.',
        false
      );
    }
  }


  return {
    version:
      PROFIN_WEB_ADAPTER_SCHEMA_VERSION,

    status:
      'OK',

    requiredSheets:
      checkedSheets,

    baseOperations: {
      headerRow:
        PROFIN_WEB_ADAPTER_BASE_HEADER_ROW,

      dataStartRow:
        10,

      minColumns:
        31,

      criticalColumns:
        PROFIN_WEB_ADAPTER_BASE_CRITICAL_COLUMNS
    }
  };
}


/****************************************************
 * STRING HELPER
 ****************************************************/

function profinWebAdapterSchemaRequireString_(
  object,
  key
) {
  if (
    !object ||
    typeof object[key] !==
      'string' ||
    !object[key].trim()
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_ANNUAL_ROUTE_FIELD',
      'Некоректний annual route.',
      'Missing annual route field: ' +
        key,
      false
    );
  }


  return true;
}