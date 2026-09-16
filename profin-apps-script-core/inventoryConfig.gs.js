/****************************************************
 * СКЛАДСЬКИЙ МОДУЛЬ
 * КРОК 1 — конфігурація і перевірка структури
 *
 * Файл не записує та не змінює робочі дані.
 ****************************************************/

const INVENTORY_CONFIG = Object.freeze({
  STOCK_SHEET_NAME: 'Склад медичних запасів',
  MOVEMENT_SHEET_NAME: 'Рух складу',

  STOCK_HEADERS: Object.freeze([
    'ID партії',
    'ID операції надходження',
    'Тип запасу',
    'Найменування',
    'Серія',
    'Термін придатності',
    'Дата надходження',
    'Постачальник',
    'Прийнято',
    'Собівартість одиниці',
    'Загальна закупівельна вартість',
    'Продано / використано',
    'Передано на зберігання',
    'Списано',
    'Поточний залишок',
   'Мінімальний залишок (поріг для попередження)',
    'Статус',
    'Користувач',
    'Дата і час створення'
  ]),

  MOVEMENT_HEADERS: Object.freeze([
    'ID руху',
    'ID операції',
    'Дата',
    'Тип запасу',
    'Найменування',
    'ID партії',
    'Тип руху',
    'Кількість',
    'Собівартість одиниці',
    'Загальна собівартість',
    'Користувач',
    'Дата і час створення'
  ]),

  STOCK_TYPES: Object.freeze([
    'Вакцина',
    'Тест',
    'Товар'
  ]),

  MOVEMENT_TYPES: Object.freeze([
    'Надходження',
    'Продаж',
    'Продаж і використання',
    'Передано на зберігання',
    'Використання зі зберігання',
    'Списання',
    'Повернення',
    'Коригування'
  ]),

LOT_STATUSES: Object.freeze([
  'Активна',
  'Низький залишок',
  'Закрита',
  'Прострочена',
  'Заблокована'
]),

DEFAULT_MINIMUM_STOCK: Object.freeze({
  'Вакцина': 2,
  'Тест': 5,
  'Товар': 3
})
});
/**
 * Визначає, чи є операція прийманням запасів на склад.
 *
 * @param {Object} data
 * @return {boolean}
 */
/**
 * Визначає, чи є операція надходженням запасів на склад.
 *
 * Єдиний маршрут:
 * Витрати → Медичні витрати → складська стаття.
 *
 * @param {Object} data
 * @return {boolean}
 */
function isInventoryReceiptOperation_(data) {
  if (!data) return false;

  const type =
    String(data.type || '').trim();

  const category =
    String(data.category || '').trim();

  const article =
    String(data.article || '').trim();

  if (
    type !== 'Витрати' ||
    category !== 'Медичні витрати'
  ) {
    return false;
  }

  return [
    'Закупка вакцин',
    'Закупка тестів',
    'Закупка косметичних товарів'
  ].includes(article);
}
/**
 * Визначає тип запасу за типом і категорією операції.
 *
 * @param {Object} data
 * @return {string}
 */
/**
 * Визначає тип запасу за статтею медичних витрат.
 *
 * @param {Object} data
 * @return {string}
 */
function getInventoryTypeFromOperation_(data) {
  if (!isInventoryReceiptOperation_(data)) {
    return '';
  }

  const article =
    String(data.article || '').trim();

  if (article === 'Закупка вакцин') {
    return 'Вакцина';
  }

  if (article === 'Закупка тестів') {
    return 'Тест';
  }

  if (
    article ===
    'Закупка косметичних товарів'
  ) {
    return 'Товар';
  }

  return '';
}
/**
 * Повертає стандартний мінімальний залишок
 * для відповідного типу запасу.
 *
 * @param {string} inventoryType
 * @return {number}
 */
/****************************************************
 * НОРМАЛІЗАЦІЯ ТИПУ ЗАПАСУ
 ****************************************************/
function normalizeInventoryMinimumStockType_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


/****************************************************
 * БЕЗПЕЧНЕ ЧИТАННЯ ЧИСЛА
 *
 * Працює і з числом 10,
 * і з текстом "10 шт.".
 ****************************************************/
function parseInventoryMinimumStockNumber_(
  value
) {
  if (
    typeof value === 'number'
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const normalized =
    String(value || '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

  const number =
    Number(normalized);

  return Number.isFinite(number)
    ? number
    : 0;
}


/****************************************************
 * ЧИТАННЯ ПОРОГІВ ІЗ «ДОВІДНИКА»
 *
 * Довідник:
 * F39:F41 — тип запасу;
 * G39:G41 — мінімальний залишок.
 ****************************************************/
function getInventoryMinimumStockSettings_() {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      'Довідник'
    );

  const settings = {};

  if (!sheet) {
    return settings;
  }

  const values =
    sheet
      .getRange(
        39,
        6,
        3,
        2
      )
      .getValues();

  values.forEach(
    function(row) {
      const inventoryType =
        String(
          row[0] || ''
        ).trim();

      const minimumStock =
        parseInventoryMinimumStockNumber_(
          row[1]
        );

      if (!inventoryType) {
        return;
      }

      settings[
        normalizeInventoryMinimumStockType_(
          inventoryType
        )
      ] = {
        inventoryType:
          inventoryType,

        minimumStock:
          minimumStock
      };
    }
  );

  return settings;
}


/****************************************************
 * СТАНДАРТНИЙ МІНІМАЛЬНИЙ ЗАЛИШОК
 *
 * Основне джерело — «Довідник».
 * DEFAULT_MINIMUM_STOCK — лише резерв.
 ****************************************************/
function getDefaultInventoryMinimumStock_(
  inventoryType
) {
  const normalizedType =
    normalizeInventoryMinimumStockType_(
      inventoryType
    );

  if (!normalizedType) {
    return 0;
  }

  const directorySettings =
    getInventoryMinimumStockSettings_();

  if (
    Object.prototype
      .hasOwnProperty.call(
        directorySettings,
        normalizedType
      )
  ) {
    return parseInventoryMinimumStockNumber_(
      directorySettings[
        normalizedType
      ].minimumStock
    );
  }

  /*
   * Резерв: старий конфіг,
   * якщо «Довідник» тимчасово недоступний.
   */
  const fallback =
    INVENTORY_CONFIG
      .DEFAULT_MINIMUM_STOCK || {};

  const fallbackKey =
    Object.keys(fallback)
      .find(
        function(key) {
          return (
            normalizeInventoryMinimumStockType_(
              key
            ) ===
            normalizedType
          );
        }
      );

  if (fallbackKey) {
    return parseInventoryMinimumStockNumber_(
      fallback[fallbackKey]
    );
  }

  return 0;
}
function isInventorySaleOperation_(data) {
  return Boolean(
    (
      data.type === 'Доходи' &&
      data.category === 'Швидкі тести'
    ) ||
    (
      data.type === 'Доходи' &&
      data.category === 'Косметичні засоби'
    )
  );
}
function getInventorySaleType_(data) {
  if (
    data.type === 'Доходи' &&
    data.category === 'Швидкі тести'
  ) {
    return 'Тест';
  }

  if (
    data.type === 'Доходи' &&
    data.category === 'Косметичні засоби'
  ) {
    return 'Товар';
  }

  return '';
}

/**
 * Перевіряє готовність структури складського модуля.
 *
 * ВАЖЛИВО:
 * - не створює листи;
 * - не змінює заголовки;
 * - не форматує;
 * - не записує дані.
 *
 * @return {Object} структурований результат перевірки
 */
function assertInventoryModuleReady_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const result = {
    ok: false,
    checkedAt: new Date(),
    sheets: {},
    errors: [],
    warnings: [],
    noCellsWritten: true
  };

  const stockSheet = ss.getSheetByName(
    INVENTORY_CONFIG.STOCK_SHEET_NAME
  );

  const movementSheet = ss.getSheetByName(
    INVENTORY_CONFIG.MOVEMENT_SHEET_NAME
  );

  if (!stockSheet) {
    result.errors.push(
      'Не знайдено лист "' +
      INVENTORY_CONFIG.STOCK_SHEET_NAME +
      '". Перевірте точну назву та відсутність зайвих пробілів.'
    );
  }

  if (!movementSheet) {
    result.errors.push(
      'Не знайдено лист "' +
      INVENTORY_CONFIG.MOVEMENT_SHEET_NAME +
      '". Перевірте точну назву та відсутність зайвих пробілів.'
    );
  }

  if (stockSheet) {
    result.sheets.stock = checkInventorySheetStructure_(
      stockSheet,
      INVENTORY_CONFIG.STOCK_HEADERS
    );

    result.errors.push.apply(
      result.errors,
      result.sheets.stock.errors
    );

    result.warnings.push.apply(
      result.warnings,
      result.sheets.stock.warnings
    );
  }

  if (movementSheet) {
    result.sheets.movement = checkInventorySheetStructure_(
      movementSheet,
      INVENTORY_CONFIG.MOVEMENT_HEADERS
    );

    result.errors.push.apply(
      result.errors,
      result.sheets.movement.errors
    );

    result.warnings.push.apply(
      result.warnings,
      result.sheets.movement.warnings
    );
  }

  result.ok = result.errors.length === 0;

  if (!result.ok) {
    throw new Error(
      'Складський модуль не готовий:\n\n' +
      result.errors.join('\n')
    );
  }

  return result;
}


/**
 * Перевіряє один лист та його заголовки.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} expectedHeaders
 * @return {Object}
 */
function checkInventorySheetStructure_(sheet, expectedHeaders) {
  const result = {
    sheetName: sheet.getName(),
    ok: false,
    expectedColumnCount: expectedHeaders.length,
    actualColumnCount: 0,
    errors: [],
    warnings: []
  };

  if (sheet.getMaxColumns() < expectedHeaders.length) {
    result.errors.push(
      'Лист "' + sheet.getName() +
      '" має лише ' + sheet.getMaxColumns() +
      ' колонок, потрібно щонайменше ' +
      expectedHeaders.length + '.'
    );

    return result;
  }

  const actualHeaders = sheet
    .getRange(1, 1, 1, expectedHeaders.length)
    .getDisplayValues()[0]
    .map(function(value) {
      return String(value || '').trim();
    });

  result.actualColumnCount = actualHeaders.length;

  expectedHeaders.forEach(function(expectedHeader, index) {
    const actualHeader = actualHeaders[index];
    const columnLetter = columnToLetter_(index + 1);

    if (!actualHeader) {
      result.errors.push(
        'Лист "' + sheet.getName() +
        '", колонка ' + columnLetter +
        ': заголовок порожній. Очікується "' +
        expectedHeader + '".'
      );

      return;
    }

    if (actualHeader !== expectedHeader) {
      result.errors.push(
        'Лист "' + sheet.getName() +
        '", колонка ' + columnLetter +
        ': знайдено "' + actualHeader +
        '", очікується "' + expectedHeader + '".'
      );
    }
  });

  const headerDuplicates = findDuplicateStrings_(actualHeaders);

  if (headerDuplicates.length > 0) {
    result.errors.push(
      'Лист "' + sheet.getName() +
      '" містить дублікати заголовків: ' +
      headerDuplicates.join(', ') + '.'
    );
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn > expectedHeaders.length) {
    result.warnings.push(
      'Лист "' + sheet.getName() +
      '" має додаткові колонки після ' +
      columnToLetter_(expectedHeaders.length) +
      '. Перевірте, чи вони справді потрібні.'
    );
  }

  result.ok = result.errors.length === 0;

  return result;
}


/**
 * Сухий тест структури.
 * Не записує дані.
 */
/**
 * Сухий тест структури складського модуля.
 *
 * Не записує дані.
 * Не змінює листи.
 * Не відкриває діалогові вікна.
 *
 * @return {Object}
 */
function testInventoryModuleStructure() {
  const startedAt = new Date();

  try {
    const result = assertInventoryModuleReady_();

    const testResult = {
      ok: true,
      test: 'testInventoryModuleStructure',
      startedAt: startedAt,
      finishedAt: new Date(),

      stockSheetReady:
        Boolean(result.sheets.stock && result.sheets.stock.ok),

      movementSheetReady:
        Boolean(result.sheets.movement && result.sheets.movement.ok),

      noCellsWritten: true,
      errors: result.errors || [],
      warnings: result.warnings || []
    };

    Logger.log(JSON.stringify(testResult, null, 2));

    return testResult;

  } catch (error) {
    const failedResult = {
      ok: false,
      test: 'testInventoryModuleStructure',
      startedAt: startedAt,
      finishedAt: new Date(),
      noCellsWritten: true,
      error: String(error && error.message
        ? error.message
        : error)
    };

    Logger.log(JSON.stringify(failedResult, null, 2));

    return failedResult;
  }
}


/**
 * Повертає повторювані непорожні рядки.
 *
 * @param {string[]} values
 * @return {string[]}
 */
function findDuplicateStrings_(values) {
  const seen = {};
  const duplicates = {};

  values.forEach(function(value) {
    const normalized = String(value || '').trim();

    if (!normalized) {
      return;
    }

    if (seen[normalized]) {
      duplicates[normalized] = true;
    }

    seen[normalized] = true;
  });

  return Object.keys(duplicates);
}


/**
 * Перетворює номер колонки на літеру.
 *
 * @param {number} columnNumber
 * @return {string}
 */
function columnToLetter_(columnNumber) {
  let number = columnNumber;
  let result = '';

  while (number > 0) {
    const remainder = (number - 1) % 26;
    result =
      String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }

  return result;
}
/**
 * Сухий тест складських закупівель.
 *
 * Перевіряє:
 * 1. закупку вакцин;
 * 2. закупку тестів;
 * 3. закупку косметичних товарів;
 * 4. звичайну медичну витрату.
 *
 * НЕ записує дані в жоден лист.
 *
 * @return {Object}
 */
function testInventoryReceiptInputDryRun() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG.STOCK_SHEET_NAME
    );

  const movementSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG.MOVEMENT_SHEET_NAME
    );

  /*
   * Фіксуємо стан листів до тесту.
   */
  const beforeState = {
    stockLastRow:
      stockSheet
        ? stockSheet.getLastRow()
        : null,

    movementLastRow:
      movementSheet
        ? movementSheet.getLastRow()
        : null
  };

  const operationDate =
    new Date();

  operationDate.setHours(
    0,
    0,
    0,
    0
  );

  const expiryDate =
    new Date(
      operationDate.getFullYear() + 1,
      operationDate.getMonth(),
      operationDate.getDate()
    );

  /*
   * Базовий об'єкт містить усі поля,
   * які можуть використовуватись валідацією.
   */
  const baseData = {
    date: operationDate,

    account: 'Каса, грн',
    transferTo: '',

    type: 'Витрати',
    category: 'Медичні витрати',
    article: '',

    doctor: '',
    patient: '',

    unitPrice: 100,
    quantity: 2,
    amount: 200,

    comment: 'Сухий тест складської закупівлі',
    id: '',

    packageStart: '',
    packageDuration: '',
    packageMonthlyAmount: '',
    packageAccrualStart: '',

    vaccineName: '',
    vaccinePatient: '',
    vaccineQty: '',
    vaccineCost: '',
    vaccineUseDate: '',
    storedVaccineId: '',

    assetName: '',
    assetCategory: '',
    assetAmortization: '',
    assetStartDate: '',

    inventoryName: 'Тестова позиція',
    inventorySeries: 'TEST-LOT-001',
    inventoryExpiryDate: expiryDate,
    inventorySupplier: 'Тестовий постачальник',
    inventoryMinimumStock: ''
  };

  const testCases = [
    {
      name: 'Закупка вакцин',

      data: Object.assign(
        {},
        baseData,
        {
          article: 'Закупка вакцин',
          inventoryName:
            'Тестова вакцина',
          inventorySeries:
            'VAC-TEST-001',
          inventoryExpiryDate:
            expiryDate
        }
      ),

      expected: {
        isInventoryReceipt: true,
        inventoryType: 'Вакцина',
        minimumStock: 2,
        validationOk: true
      }
    },

    {
      name: 'Закупка тестів',

      data: Object.assign(
        {},
        baseData,
        {
          article: 'Закупка тестів',
          inventoryName:
            'Тестовий швидкий тест',
          inventorySeries:
            'TEST-001',
          inventoryExpiryDate:
            expiryDate
        }
      ),

      expected: {
        isInventoryReceipt: true,
        inventoryType: 'Тест',
        minimumStock: 5,
        validationOk: true
      }
    },

    {
      name:
        'Закупка косметичних товарів',

      data: Object.assign(
        {},
        baseData,
        {
          article:
            'Закупка косметичних товарів',

          inventoryName:
            'Тестовий косметичний товар',

          /*
           * Для товару серія і термін
           * придатності можуть бути порожніми.
           */
          inventorySeries: '',
          inventoryExpiryDate: ''
        }
      ),

      expected: {
        isInventoryReceipt: true,
        inventoryType: 'Товар',
        minimumStock: 3,
        validationOk: true
      }
    },

    {
      name:
        'Звичайна медична витрата',

      data: Object.assign(
        {},
        baseData,
        {
          article:
            'Лабораторні послуги',

          inventoryName: '',
          inventorySeries: '',
          inventoryExpiryDate: '',
          inventorySupplier: ''
        }
      ),

      expected: {
        isInventoryReceipt: false,
        inventoryType: '',
        minimumStock: 0,

        /*
         * Тут можуть бути попередження
         * про лікаря та пацієнта,
         * але критичних помилок бути не повинно.
         */
        validationOk: true
      }
    }
  ];

  const results =
    testCases.map(function(testCase) {
      const data =
        Object.assign(
          {},
          testCase.data
        );

      const isInventoryReceipt =
        isInventoryReceiptOperation_(
          data
        );

      const inventoryType =
        getInventoryTypeFromOperation_(
          data
        );

      const minimumStock =
        inventoryType
          ? getDefaultInventoryMinimumStock_(
              inventoryType
            )
          : 0;

      data.inventoryMinimumStock =
        minimumStock;

      const validation =
        validateInputOperation_(
          data
        );

      const checks = {
        isInventoryReceipt:
          isInventoryReceipt ===
          testCase.expected
            .isInventoryReceipt,

        inventoryType:
          inventoryType ===
          testCase.expected
            .inventoryType,

        minimumStock:
          minimumStock ===
          testCase.expected
            .minimumStock,

        validation:
          validation.ok ===
          testCase.expected
            .validationOk
      };

      const passed =
        Object.keys(checks)
          .every(function(key) {
            return checks[key];
          });

      return {
        name: testCase.name,
        passed: passed,

        actual: {
          isInventoryReceipt:
            isInventoryReceipt,

          inventoryType:
            inventoryType,

          minimumStock:
            minimumStock,

          validationOk:
            validation.ok,

          validationMessage:
            validation.message,

          errors:
            validation.errors || [],

          warnings:
            validation.warnings || []
        },

        expected:
          testCase.expected,

        checks:
          checks
      };
    });

  /*
   * Повторно читаємо стан листів.
   */
  const afterState = {
    stockLastRow:
      stockSheet
        ? stockSheet.getLastRow()
        : null,

    movementLastRow:
      movementSheet
        ? movementSheet.getLastRow()
        : null
  };

  const noRowsAdded =
    beforeState.stockLastRow ===
      afterState.stockLastRow &&
    beforeState.movementLastRow ===
      afterState.movementLastRow;

  const allCasesPassed =
    results.every(function(result) {
      return result.passed;
    });

  const finalResult = {
    ok:
      allCasesPassed &&
      noRowsAdded,

    test:
      'testInventoryReceiptInputDryRun',

    noRowsAdded:
      noRowsAdded,

    beforeState:
      beforeState,

    afterState:
      afterState,

    cases:
      results
  };

  Logger.log(
    JSON.stringify(
      finalResult,
      null,
      2
    )
  );

  return finalResult;
}
/****************************************************
 * РУЧНИЙ ЗАПУСК СИНХРОНІЗАЦІЇ
 *
 * Оновлює у «Склад медичних запасів»:
 * P — мінімальний залишок;
 * Q — статус.
 ****************************************************/
function syncInventoryMinimumStockFromDirectory() {
  return syncInventoryMinimumStockFromDirectory_(
    false
  );
}


/****************************************************
 * ВНУТРІШНЯ СИНХРОНІЗАЦІЯ
 *
 * @param {boolean} silent
 * @return {Object}
 ****************************************************/
function syncInventoryMinimumStockFromDirectory_(
  silent
) {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME +
      '"'
    );
  }

  const settings =
    getInventoryMinimumStockSettings_();

  if (
    !Object.keys(settings).length
  ) {
    throw new Error(
      'У «Довіднику» не знайдено пороги запасів у діапазоні F39:G41'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok:
        true,

      updatedRows:
        0,

      reason:
        'На складі немає партій'
    };
  }

  const lock =
    LockService
      .getDocumentLock();

  lock.waitLock(
    30000
  );

  try {
    /*
     * Читаємо A:Q.
     *
     * A — ID партії;
     * C — тип запасу;
     * O — поточний залишок;
     * P — поріг;
     * Q — статус.
     */
    const values =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          17
        )
        .getValues();

    const output = [];

    let updatedRows = 0;
    const skippedTypes = {};

    values.forEach(
      function(row) {
        const lotId =
          String(
            row[0] || ''
          ).trim();

        const inventoryType =
          String(
            row[2] || ''
          ).trim();

        const currentBalance =
          parseInventoryMinimumStockNumber_(
            row[14]
          );

        const currentMinimum =
          parseInventoryMinimumStockNumber_(
            row[15]
          );

        const currentStatus =
          String(
            row[16] || ''
          ).trim();

        /*
         * Порожній рядок не змінюємо.
         */
        if (!lotId) {
          output.push([
            row[15],
            row[16]
          ]);

          return;
        }

        const normalizedType =
          normalizeInventoryMinimumStockType_(
            inventoryType
          );

        const setting =
          settings[
            normalizedType
          ];

        /*
         * Невідомий тип не змінюємо.
         */
        if (!setting) {
          output.push([
            row[15],
            row[16]
          ]);

          if (inventoryType) {
            skippedTypes[
              inventoryType
            ] = true;
          }

          return;
        }

        const newMinimum =
          parseInventoryMinimumStockNumber_(
            setting.minimumStock
          );

        const normalizedStatus =
          normalizeInventoryMinimumStockType_(
            currentStatus
          );

        /*
         * Ручні захисні статуси не перезаписуємо.
         */
        const protectedStatus =
          normalizedStatus ===
            'прострочена' ||
          normalizedStatus ===
            'заблокована';

        const newStatus =
          protectedStatus
            ? currentStatus
            : resolveInventoryLotStatus_(
                currentBalance,
                newMinimum
              );

        if (
          Math.abs(
            currentMinimum -
            newMinimum
          ) > 0.000001 ||
          currentStatus !==
            newStatus
        ) {
          updatedRows++;
        }

        output.push([
          newMinimum,
          newStatus
        ]);
      }
    );

    /*
     * Одним пакетним записом оновлюємо P:Q.
     */
    sheet
      .getRange(
        2,
        16,
        output.length,
        2
      )
      .setValues(
        output
      );

    SpreadsheetApp.flush();

    const result = {
      ok:
        true,

      updatedRows:
        updatedRows,

      thresholds: {
        vaccine:
          getDefaultInventoryMinimumStock_(
            'Вакцина'
          ),

        test:
          getDefaultInventoryMinimumStock_(
            'Тест'
          ),

        product:
          getDefaultInventoryMinimumStock_(
            'Товар'
          )
      },

      skippedTypes:
        Object.keys(
          skippedTypes
        )
    };

    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    if (!silent) {
      SpreadsheetApp
        .getActive()
        .toast(
          'Пороги складу синхронізовано. Оновлено рядків: ' +
          updatedRows,
          'Склад',
          8
        );
    }

    return result;

  } finally {
    lock.releaseLock();
  }
}
/****************************************************
 * РЕАКЦІЯ НА ЗМІНУ ПОРОГІВ У «ДОВІДНИКУ»
 *
 * Не створює окремий onEdit.
 * Викликається з чинного onEdit(e).
 ****************************************************/
function handleInventoryMinimumStockDirectoryEdit_(
  e
) {
  if (
    !e ||
    !e.range
  ) {
    return;
  }

  const range =
    e.range;

  const sheet =
    range.getSheet();

  if (
    sheet.getName() !==
    'Довідник'
  ) {
    return;
  }

  const firstRow =
    range.getRow();

  const lastRow =
    range.getLastRow();

  const firstColumn =
    range.getColumn();

  const lastColumn =
    range.getLastColumn();

  const touchesRows =
    lastRow >= 39 &&
    firstRow <= 41;

  const touchesColumns =
    lastColumn >= 6 &&
    firstColumn <= 7;

  if (
    !touchesRows ||
    !touchesColumns
  ) {
    return;
  }

  syncInventoryMinimumStockFromDirectory_(
    true
  );
}
/****************************************************
 * СТАТУС СКЛАДСЬКОЇ ПАРТІЇ — СИСТЕМНИЙ ІНДИКАТОР
 *
 * Q не є полем ручного вводу.
 * Q не визначає можливість продажу.
 *
 * Джерело істини для вибуття:
 * — O Поточний залишок;
 * — термін придатності;
 * — дата надходження.
 *
 * Функція лише прибирає старі правила
 * перевірки даних із колонки Q.
 ****************************************************/

function removeInventoryStatusDataValidation() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INVENTORY_CONFIG.STOCK_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG.STOCK_SHEET_NAME +
      '"'
    );
  }

  const maxRows =
    sheet.getMaxRows();

  if (maxRows < 2) {
    return {
      ok: true,
      range: '',
      validationsRemoved: false,
      businessValuesChanged: false
    };
  }

  /*
   * Q = колонка 17.
   *
   * Очищаємо ТІЛЬКИ перевірку даних.
   * Значення статусів не змінюємо.
   * Форматування не змінюємо.
   */
  sheet
    .getRange(
      2,
      17,
      maxRows - 1,
      1
    )
    .clearDataValidations();

  SpreadsheetApp.flush();

  const result = {
    ok: true,

    sheet:
      INVENTORY_CONFIG.STOCK_SHEET_NAME,

    range:
      'Q2:Q' + maxRows,

    validationsRemoved:
      true,

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