/****************************************************
 * ПЕРЕГЛЯД ОСТАННІХ ОПЕРАЦІЙ
 * --------------------------------------------------
 * Логіка:
 * — при відкритті файла стартовим залишається
 *   лист «Ввід операцій»;
 * — для листа «База операцій» запам’ятовується
 *   позиція початку останніх 20 записів;
 * — при переході на вкладку користувач бачить
 *   останні 20 операцій;
 * — старі рядки не приховуються;
 * — сортування, фільтри та бізнес-дані
 *   не змінюються.
 ****************************************************/

const BASE_OPERATIONS_VIEW_CONFIG = {
  baseSheetName:
    'База операцій',

  inputSheetName:
    'Ввід операцій',

  firstDataRow:
    2,

  idColumn:
    1,

 visibleRecordCount:
  20,

 scrollAnchorOffset:
  50
};


/****************************************************
 * ФОРМУВАННЯ ПЛАНУ ПЕРЕГЛЯДУ
 *
 * Нічого не змінює у таблиці.
 ****************************************************/

function getBaseOperationsViewPlan_(
  sheet
) {
  if (!sheet) {
    throw new Error(
      'Не передано лист для перегляду Бази операцій.'
    );
  }

  const config =
    BASE_OPERATIONS_VIEW_CONFIG;

  const physicalLastRow =
    sheet.getLastRow();

  if (
    physicalLastRow <
    config.firstDataRow
  ) {
    return {
      ok:
        true,

      recordsFound:
        0,

      firstVisibleRow:
        1,

      lastDataRow:
        1,

      recordRows:
        []
    };
  }

  const idValues =
    sheet
      .getRange(
        config.firstDataRow,
        config.idColumn,
        physicalLastRow -
          config.firstDataRow +
          1,
        1
      )
      .getDisplayValues()
      .flat();

  const recordRows =
    [];

  /*
   * Ідемо знизу догори та збираємо
   * останні 20 фактичних записів за ID.
   */
  for (
    let index =
      idValues.length - 1;

    index >= 0 &&
    recordRows.length <
      config.visibleRecordCount;

    index--
  ) {
    const operationId =
      String(
        idValues[index] || ''
      ).trim();

    if (!operationId) {
      continue;
    }

    recordRows.push(
      config.firstDataRow +
      index
    );
  }

  if (!recordRows.length) {
    return {
      ok:
        true,

      recordsFound:
        0,

      firstVisibleRow:
        1,

      lastDataRow:
        1,

      recordRows:
        []
    };
  }

  const lastDataRow =
    recordRows[0];

  const firstVisibleRow =
    recordRows[
      recordRows.length - 1
    ];

  return {
    ok:
      true,

    recordsFound:
      recordRows.length,

    firstVisibleRow:
      firstVisibleRow,

    lastDataRow:
      lastDataRow,

    recordRows:
      recordRows
        .slice()
        .reverse()
  };
}

/****************************************************
 * ПЕРЕХІД ДО ОСТАННІХ 20 ЗАПИСІВ
 ****************************************************/

function focusBaseOperationsLastRecords_(
  sheet
) {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    BASE_OPERATIONS_VIEW_CONFIG;

  const targetSheet =
    sheet ||
    spreadsheet.getSheetByName(
      config.baseSheetName
    );

  if (!targetSheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.baseSheetName +
      '».'
    );
  }

  const plan =
    getBaseOperationsViewPlan_(
      targetSheet
    );

  spreadsheet.setActiveSheet(
    targetSheet,
    false
  );

  positionBaseOperationsViewport_(
    targetSheet,
    plan
  );

  return plan;
}

/****************************************************
 * ПІДГОТОВКА ЗАПАМ’ЯТОВАНОЇ ПОЗИЦІЇ
 ****************************************************/

function prepareBaseOperationsRememberedPosition_(
  returnSheet,
  returnCellA1
) {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    BASE_OPERATIONS_VIEW_CONFIG;

  const baseSheet =
    spreadsheet.getSheetByName(
      config.baseSheetName
    );

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.baseSheetName +
      '».'
    );
  }

  /*
   * Якщо returnSheet явно не переданий,
   * запам'ятовуємо фактичний активний лист.
   */
  const targetReturnSheet =
    returnSheet ||
    spreadsheet.getActiveSheet();

  const plan =
    getBaseOperationsViewPlan_(
      baseSheet
    );

  /*
   * КРИТИЧНО:
   *
   * Якщо користувач зараз на Дашборді,
   * взагалі НЕ перемикаємо листи.
   *
   * Це захищає Дашборд і його діаграми
   * від фонових setActiveSheet().
   */
  if (
    targetReturnSheet &&
    targetReturnSheet.getName() ===
      'Дашборд'
  ) {
    SpreadsheetApp.flush();

    return plan;
  }

  /*
   * Якщо користувач уже знаходиться
   * на «База операцій» —
   * просто позиціонуємо цей лист.
   *
   * Не робимо зайве перемикання
   * на нього і назад.
   */
  if (
    targetReturnSheet &&
    targetReturnSheet.getSheetId() ===
      baseSheet.getSheetId()
  ) {
    positionBaseOperationsViewport_(
      baseSheet,
      plan
    );

    SpreadsheetApp.flush();

    return plan;
  }

  let switchedToBase =
    false;

  try {
    /*
     * Тимчасово відкриваємо Базу
     * тільки для позиціонування.
     */
    spreadsheet.setActiveSheet(
      baseSheet,
      false
    );

    switchedToBase =
      true;

    positionBaseOperationsViewport_(
      baseSheet,
      plan
    );

  } finally {
    /*
     * Навіть якщо positionBaseOperationsViewport_()
     * завершиться помилкою,
     * користувача повертаємо
     * на початковий лист.
     */
    if (
      switchedToBase &&
      targetReturnSheet
    ) {
      spreadsheet.setActiveSheet(
        targetReturnSheet,
        true
      );

      /*
       * Повертаємо також попередню
       * активну клітинку.
       */
      if (returnCellA1) {
        try {
          targetReturnSheet
            .getRange(
              returnCellA1
            )
            .activate();

        } catch (error) {
          /*
           * Нічого не робимо.
           *
           * Не примушуємо користувача
           * переходити в B4.
           */
        }
      }
    }

    SpreadsheetApp.flush();
  }

  return plan;
}


/****************************************************
 * ІНІЦІАЛІЗАЦІЯ ПРИ ВІДКРИТТІ ФАЙЛА
 *
 * Викликається з чинного onOpen().
 ****************************************************/

function initializeBaseOperationsViewOnOpen_() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const currentSheet =
    spreadsheet.getActiveSheet();

  if (!currentSheet) {
    return {
      ok: true,
      skipped: true,
      reason: 'NO_ACTIVE_SHEET'
    };
  }

  const currentSheetName =
    currentSheet.getName();

  /*
   * ========================================================
   * ДАШБОРД
   * ========================================================
   *
   * Якщо файл відкрився на Дашборді —
   * нічого не перемикаємо.
   */
  if (
    currentSheetName ===
    'Дашборд'
  ) {
    const result = {
      ok: true,

      skipped: true,

      reason:
        'ACTIVE_SHEET_IS_DASHBOARD',

      initialSheet:
        currentSheetName,

      businessValuesChanged:
        false
    };

    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;
  }

  /*
   * Запам'ятовуємо фактичну клітинку,
   * де користувач перебував.
   */
  const activeRange =
    currentSheet.getActiveRange();

  const currentCellA1 =
    activeRange
      ? activeRange.getA1Notation()
      : '';

  /*
   * Підготовка Бази може тимчасово
   * переключити лист, але після завершення
   * користувач повертається САМЕ
   * на currentSheet.
   */
  const plan =
    prepareBaseOperationsRememberedPosition_(
      currentSheet,
      currentCellA1
    );

  const result = {
    ok: true,

    skipped: false,

    test:
      'initializeBaseOperationsViewOnOpen_',

    initialSheet:
      currentSheetName,

    preparedSheet:
      BASE_OPERATIONS_VIEW_CONFIG
        .baseSheetName,

    returnedToSheet:
      currentSheetName,

    recordsFound:
      plan.recordsFound,

    firstVisibleRow:
      plan.firstVisibleRow,

    lastDataRow:
      plan.lastDataRow,

    businessValuesChanged:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/****************************************************
 * ОНОВЛЕННЯ ПОЗИЦІЇ ПІСЛЯ НОВОЇ ОПЕРАЦІЇ
 *
 * Викликається після успішного
 * postInputOperation().
 ****************************************************/

function refreshBaseOperationsViewPosition_() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const currentSheet =
    spreadsheet.getActiveSheet();

  const currentRange =
    currentSheet
      ? currentSheet.getActiveRange()
      : null;

  const currentCellA1 =
    currentRange
      ? currentRange.getA1Notation()
      : '';

  const plan =
    prepareBaseOperationsRememberedPosition_(
      currentSheet,
      currentCellA1
    );

  const result = {
    ok:
      true,

    recordsFound:
      plan.recordsFound,

    firstVisibleRow:
      plan.firstVisibleRow,

    lastDataRow:
      plan.lastDataRow,

    businessValuesChanged:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/****************************************************
 * СУХИЙ АУДИТ
 *
 * Лише читає дані.
 ****************************************************/

function auditBaseOperationsView() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    BASE_OPERATIONS_VIEW_CONFIG;

  const sheet =
    spreadsheet.getSheetByName(
      config.baseSheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.baseSheetName +
      '».'
    );
  }

  const plan =
    getBaseOperationsViewPlan_(
      sheet
    );

  const recordIds =
    plan.recordRows.map(
      function(row) {
        return String(
          sheet
            .getRange(
              row,
              config.idColumn
            )
            .getDisplayValue() ||
          ''
        ).trim();
      }
    );

  const result = {
    ok:
      true,

    test:
      'auditBaseOperationsView',

    version:
      '2.0',

    spreadsheet:
      spreadsheet.getName(),

    sheet:
      config.baseSheetName,

    requestedRecords:
      config.visibleRecordCount,

    recordsFound:
      plan.recordsFound,

    firstVisibleRow:
      plan.firstVisibleRow,

    lastDataRow:
      plan.lastDataRow,

    recordRows:
      plan.recordRows,

    recordIds:
      recordIds,

    rowsHidden:
      false,

    sortingApplied:
      false,

    filtersChanged:
      false,

    businessValuesChanged:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/****************************************************
 * РУЧНИЙ ТЕСТ ПЕРЕГЛЯДУ
 ****************************************************/

function testBaseOperationsView() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    BASE_OPERATIONS_VIEW_CONFIG;

  const sheet =
    spreadsheet.getSheetByName(
      config.baseSheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.baseSheetName +
      '».'
    );
  }

  const plan =
    focusBaseOperationsLastRecords_(
      sheet
    );

  const result = {
    ok:
      true,

    test:
      'testBaseOperationsView',

    spreadsheet:
      spreadsheet.getName(),

    recordsFound:
      plan.recordsFound,

    firstVisibleRow:
      plan.firstVisibleRow,

    lastDataRow:
      plan.lastDataRow,

    businessValuesChanged:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/****************************************************
 * ТЕСТ ПІДГОТОВКИ ЗАПАМ’ЯТОВАНОЇ ПОЗИЦІЇ
 *
 * Фінально повертає користувача
 * на «Ввід операцій».
 ****************************************************/

function testBaseOperationsRememberedPosition() {
  return initializeBaseOperationsViewOnOpen_();
}
/****************************************************
 * ПОЗИЦІЮВАННЯ ЕКРАНА БАЗИ ОПЕРАЦІЙ
 *
 * Спочатку активує технічний рядок нижче
 * останньої операції, а потім повертається
 * до першого рядка останньої двадцятки.
 *
 * Дані не змінює.
 ****************************************************/

function positionBaseOperationsViewport_(
  sheet,
  plan
) {
  if (!sheet) {
    throw new Error(
      'Не передано лист для позиціювання.'
    );
  }

  if (!plan) {
    throw new Error(
      'Не передано план перегляду.'
    );
  }

  const config =
    BASE_OPERATIONS_VIEW_CONFIG;

  if (
    plan.recordsFound ===
    0
  ) {
    sheet
      .getRange(
        1,
        config.idColumn
      )
      .activate();

    SpreadsheetApp.flush();

    return {
      ok:
        true,

      anchorRow:
        1,

      targetRow:
        1
    };
  }

  /*
   * Переходимо значно нижче останньої операції.
   * Це змушує інтерфейс прокрутити лист униз.
   */
  const anchorRow =
    Math.min(
      sheet.getMaxRows(),

      plan.lastDataRow +
        config.scrollAnchorOffset
    );

  sheet
    .getRange(
      anchorRow,
      config.idColumn
    )
    .activate();

  SpreadsheetApp.flush();

  /*
   * Коротка пауза потрібна інтерфейсу Sheets,
   * щоб завершити переміщення екрана.
   */
  Utilities.sleep(
    200
  );

  /*
   * Повертаємося до першого рядка
   * останньої двадцятки.
   *
   * Оскільки він тепер знаходиться вище
   * видимої області, Sheets прокручує його
   * до верхньої частини екрана.
   */
  sheet
    .getRange(
      plan.firstVisibleRow,
      config.idColumn
    )
    .activate();

  SpreadsheetApp.flush();

  Utilities.sleep(
    200
  );

  return {
    ok:
      true,

    anchorRow:
      anchorRow,

    targetRow:
      plan.firstVisibleRow
  };
}