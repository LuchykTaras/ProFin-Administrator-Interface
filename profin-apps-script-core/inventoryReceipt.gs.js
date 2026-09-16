/****************************************************
 * СКЛАД — НАДХОДЖЕННЯ ЗАПАСІВ
 * --------------------------------------------------
 * Окремий модуль запису:
 * 1. партії в "Склад медичних запасів";
 * 2. руху "Надходження" в "Рух складу".
 *
 * Поки НЕ підключений до postInputOperation().
 ****************************************************/


/**
 * Записує складське надходження:
 * — одну партію в склад;
 * — один рух "Надходження".
 *
 * @param {Object} data
 * @return {Object}
 */
function writeInventoryReceipt_(data) {
  assertInventoryModuleReady_();

  if (!data) {
    throw new Error(
      'Не передано дані складської операції'
    );
  }

  if (
    !isInventoryReceiptOperation_(data)
  ) {
    throw new Error(
      'Операція не є складським надходженням'
    );
  }

  if (!data.id) {
    throw new Error(
      'Не визначено ID фінансової операції'
    );
  }

  const inventoryType =
    getInventoryTypeFromOperation_(data);

  if (!inventoryType) {
    throw new Error(
      'Не вдалося визначити тип запасу'
    );
  }

  const quantity =
    Number(data.quantity) || 0;

  const unitCost =
    Math.abs(
      Number(data.unitPrice) || 0
    );

  const totalCost =
    Math.abs(
      Number(data.amount) || 0
    );

  if (quantity <= 0) {
    throw new Error(
      'Кількість надходження має бути більшою за нуль'
    );
  }

  if (unitCost <= 0) {
    throw new Error(
      'Собівартість одиниці має бути більшою за нуль'
    );
  }

  if (totalCost <= 0) {
    throw new Error(
      'Загальна вартість надходження має бути більшою за нуль'
    );
  }

  if (
    Math.abs(
      totalCost -
      quantity * unitCost
    ) > 0.01
  ) {
    throw new Error(
      'Сума не дорівнює кількості × собівартості одиниці'
    );
  }

  const lotId =
    buildInventoryLotId_(
      data.id
    );

  const movementId =
    buildInventoryMovementId_(
      data.id
    );

  /*
   * Захист від повторного проведення.
   */
  assertInventoryReceiptNotExists_(
    data.id,
    lotId,
    movementId
  );

  const stockResult =
    writeInventoryStockLot_(
      data,
      {
        inventoryType:
          inventoryType,

        lotId:
          lotId,

        quantity:
          quantity,

        unitCost:
          unitCost,

        totalCost:
          totalCost
      }
    );

  try {
    const movementResult =
      writeInventoryReceiptMovement_(
        data,
        {
          inventoryType:
            inventoryType,

          lotId:
            lotId,

          movementId:
            movementId,

          quantity:
            quantity,

          unitCost:
            unitCost,

          totalCost:
            totalCost
        }
      );

    return {
      ok: true,
      operationId:
        data.id,
      inventoryType:
        inventoryType,
      lotId:
        lotId,
      movementId:
        movementId,
      stockRow:
        stockResult.row,
      movementRow:
        movementResult.row
    };

  } catch (error) {
    /*
     * Якщо рух не записався —
     * прибираємо вже створену партію.
     */
    clearInventoryStockRow_(
      stockResult.row
    );

    throw error;
  }
}


/**
 * Записує одну партію в лист
 * "Склад медичних запасів".
 *
 * @param {Object} data
 * @param {Object} receipt
 * @return {Object}
 */
function writeInventoryStockLot_(
  data,
  receipt
) {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
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

  const targetRow =
    findNextInventoryDataRow_(
      sheet
    );

  const createdAt =
    new Date();

  const minimumStock =
  getDefaultInventoryMinimumStock_(
    receipt.inventoryType
  );

  const userEmail =
    typeof getSafeUserEmail_ ===
      'function'
      ? getSafeUserEmail_()
      : '';

  const rowData = [
    receipt.lotId,              // A ID партії
    data.id,                    // B ID операції надходження
    receipt.inventoryType,      // C Тип запасу
    clean_(data.inventoryName), // D Найменування
    clean_(data.inventorySeries), // E Серія
    data.inventoryExpiryDate || '', // F Термін придатності
    data.date,                  // G Дата надходження
    clean_(data.inventorySupplier), // H Постачальник
    receipt.quantity,           // I Прийнято
    receipt.unitCost,           // J Собівартість одиниці
    receipt.totalCost,          // K Загальна закупівельна вартість
    0,                          // L Продано / використано
    0,                          // M Передано на зберігання
    0,                          // N Списано
    receipt.quantity,           // O Поточний залишок
    minimumStock,               // P Мінімальний залишок
    'Активна',                  // Q Статус
    userEmail,                  // R Користувач
    createdAt                   // S Дата і час створення
  ];

  sheet
    .getRange(
      targetRow,
      1,
      1,
      rowData.length
    )
    .setValues([
      rowData
    ]);

  sheet
    .getRange(targetRow, 6)
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(targetRow, 7)
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(targetRow, 9)
    .setNumberFormat(
      '#,##0'
    );

  sheet
    .getRange(targetRow, 10, 1, 2)
    .setNumberFormat(
      '#,##0.00'
    );

  sheet
    .getRange(targetRow, 12, 1, 5)
    .setNumberFormat(
      '#,##0'
    );

  sheet
    .getRange(targetRow, 19)
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  return {
    row:
      targetRow,
    lotId:
      receipt.lotId
  };
}


/**
 * Записує рух "Надходження"
 * в лист "Рух складу".
 *
 * @param {Object} data
 * @param {Object} receipt
 * @return {Object}
 */
function writeInventoryReceiptMovement_(
  data,
  receipt
 ) {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INVENTORY_CONFIG
          .MOVEMENT_SHEET_NAME
      );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME +
      '"'
    );
  }
  const targetRow =
    findNextInventoryDataRow_(
      sheet
    );

  const createdAt =
    new Date();

  const userEmail =
    typeof getSafeUserEmail_ ===
      'function'
      ? getSafeUserEmail_()
      : '';

  const rowData = [
    receipt.movementId,          // A ID руху
    data.id,                     // B ID операції
    data.date,                   // C Дата
    receipt.inventoryType,       // D Тип запасу
    clean_(data.inventoryName),  // E Найменування
    receipt.lotId,               // F ID партії
    'Надходження',               // G Тип руху
    receipt.quantity,            // H Кількість
    receipt.unitCost,            // I Собівартість одиниці
    receipt.totalCost,           // J Загальна собівартість
    userEmail,                   // K Користувач
    createdAt                    // L Дата і час створення
  ];

  sheet
    .getRange(
      targetRow,
      1,
      1,
      rowData.length
    )
    .setValues([
      rowData
    ]);

  sheet
    .getRange(targetRow, 3)
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(targetRow, 8)
    .setNumberFormat(
      '#,##0'
    );

  sheet
    .getRange(targetRow, 9, 1, 2)
    .setNumberFormat(
      '#,##0.00'
    );

  sheet
    .getRange(targetRow, 12)
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  return {
    row:
      targetRow,
    movementId:
      receipt.movementId
  };
}


/**
 * Перевіряє, що операція ще не була
 * проведена в складських листах.
 *
 * @param {string} operationId
 * @param {string} lotId
 * @param {string} movementId
 */
function assertInventoryReceiptNotExists_(
  operationId,
  lotId,
  movementId
) {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME
    );

  const movementSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME
    );

  if (
    inventoryValueExists_(
      stockSheet,
      1,
      lotId
    )
  ) {
    throw new Error(
      'Партія "' +
      lotId +
      '" уже існує'
    );
  }

  if (
    inventoryValueExists_(
      stockSheet,
      2,
      operationId
    )
  ) {
    throw new Error(
      'Складське надходження для операції "' +
      operationId +
      '" уже існує'
    );
  }

  if (
    inventoryValueExists_(
      movementSheet,
      1,
      movementId
    )
  ) {
    throw new Error(
      'Рух "' +
      movementId +
      '" уже існує'
    );
  }

  if (
    inventoryValueExists_(
      movementSheet,
      2,
      operationId
    )
  ) {
    throw new Error(
      'Рух складу для операції "' +
      operationId +
      '" уже існує'
    );
  }
}


/**
 * Перевіряє наявність значення
 * у конкретній колонці.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} column
 * @param {string} expectedValue
 * @return {boolean}
 */
function inventoryValueExists_(
  sheet,
  column,
  expectedValue
) {
  if (!sheet) return false;

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const expected =
    String(
      expectedValue || ''
    ).trim();

  if (!expected) {
    return false;
  }

  const values =
    sheet
      .getRange(
        2,
        column,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  return values.some(
    function(value) {
      return (
        String(value || '').trim() ===
        expected
      );
    }
  );
}


/**
 * Знаходить наступний рядок
 * після останнього непорожнього ID.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {number}
 */
function findNextInventoryDataRow_(
  sheet
) {
  const lastRow =
    Math.max(
      sheet.getLastRow(),
      1
    );

  if (lastRow < 2) {
    return 2;
  }

  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  let lastDataRow = 1;

  for (
    let index = ids.length - 1;
    index >= 0;
    index--
  ) {
    if (
      String(
        ids[index] || ''
      ).trim()
    ) {
      lastDataRow =
        index + 2;

      break;
    }
  }

  return lastDataRow + 1;
}


/**
 * Формує стабільний ID партії.
 *
 * @param {string} operationId
 * @return {string}
 */
function buildInventoryLotId_(
  operationId
) {
  return (
    String(operationId || '').trim() +
    '-LOT-1'
  );
}


/**
 * Формує стабільний ID руху надходження.
 *
 * @param {string} operationId
 * @return {string}
 */
function buildInventoryMovementId_(
  operationId
) {
  return (
    String(operationId || '').trim() +
    '-MOV-IN-1'
  );
}


/**
 * Очищає тестовий або незавершений
 * рядок партії.
 *
 * @param {number} row
 */
function clearInventoryStockRow_(
  row
) {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INVENTORY_CONFIG
          .STOCK_SHEET_NAME
      );

  if (
    !sheet ||
    !row ||
    row < 2
  ) {
    return;
  }

  sheet
    .getRange(
      row,
      1,
      1,
      INVENTORY_CONFIG
        .STOCK_HEADERS
        .length
    )
    .clearContent();
}


/**
 * Очищає тестовий або незавершений
 * рядок руху.
 *
 * @param {number} row
 */
function clearInventoryMovementRow_(
  row
) {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INVENTORY_CONFIG
          .MOVEMENT_SHEET_NAME
      );

  if (
    !sheet ||
    !row ||
    row < 2
  ) {
    return;
  }

  sheet
    .getRange(
      row,
      1,
      1,
      INVENTORY_CONFIG
        .MOVEMENT_HEADERS
        .length
    )
    .clearContent();
}
/**
 * Видаляє всі складські записи,
 * пов’язані з ID фінансової операції.
 *
 * Порядок:
 * 1. Рух складу;
 * 2. Склад медичних запасів.
 *
 * @param {string} operationId
 * @return {Object}
 */
function rollbackInventoryReceiptByOperationId_(
  operationId
) {
  const normalizedOperationId =
    String(operationId || '').trim();

  if (!normalizedOperationId) {
    throw new Error(
      'Не передано ID операції для відкату складу'
    );
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME
    );

  const movementSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME
    );

  if (!stockSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME +
      '"'
    );
  }

  if (!movementSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME +
      '"'
    );
  }

  /*
   * Спочатку очищаємо рухи,
   * потім партії.
   */
  const movementRowsCleared =
    clearInventoryRowsByValue_(
      movementSheet,
      2,
      normalizedOperationId,
      INVENTORY_CONFIG
        .MOVEMENT_HEADERS
        .length
    );

  const stockRowsCleared =
    clearInventoryRowsByValue_(
      stockSheet,
      2,
      normalizedOperationId,
      INVENTORY_CONFIG
        .STOCK_HEADERS
        .length
    );

  SpreadsheetApp.flush();

  const movementStillExists =
    inventoryValueExists_(
      movementSheet,
      2,
      normalizedOperationId
    );

  const stockStillExists =
    inventoryValueExists_(
      stockSheet,
      2,
      normalizedOperationId
    );

  if (
    movementStillExists ||
    stockStillExists
  ) {
    throw new Error(
      'Не вдалося повністю видалити складські записи операції "' +
      normalizedOperationId +
      '"'
    );
  }

  return {
    operationId:
      normalizedOperationId,

    movementRowsCleared:
      movementRowsCleared,

    stockRowsCleared:
      stockRowsCleared
  };
}
/**
 * Очищає всі рядки, де значення
 * заданої колонки збігається з очікуваним.
 *
 * Рядки фізично не видаляються,
 * очищається лише вміст.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} searchColumn
 * @param {string} expectedValue
 * @param {number} columnCount
 * @return {number}
 */
function clearInventoryRowsByValue_(
  sheet,
  searchColumn,
  expectedValue,
  columnCount
) {
  if (!sheet) {
    return 0;
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const expected =
    String(expectedValue || '').trim();

  if (!expected) {
    return 0;
  }

  const values =
    sheet
      .getRange(
        2,
        searchColumn,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  const rowsToClear = [];

  values.forEach(
    function(value, index) {
      if (
        String(value || '').trim() ===
        expected
      ) {
        rowsToClear.push(
          index + 2
        );
      }
    }
  );

  rowsToClear.forEach(
    function(row) {
      sheet
        .getRange(
          row,
          1,
          1,
          columnCount
        )
        .clearContent();
    }
  );

  return rowsToClear.length;
}
function cleanupFailedRollbackTest() {
  const operationId =
    'L-20260711-299';

  rollbackInventoryReceiptByOperationId_(
    operationId
  );

  rollbackBaseOperationById_(
    operationId
  );

  SpreadsheetApp.flush();

  Logger.log(
    'Очищено тестову операцію: ' +
    operationId
  );
}
/**
 * Контрольований тест запису надходження.
 *
 * Тест:
 * 1. створює одну тестову партію;
 * 2. створює один тестовий рух;
 * 3. перевіряє відповідність;
 * 4. очищає створені тестові рядки;
 * 5. перевіряє, що тестових записів не залишилось.
 *
 * НЕ записує в "База операцій".
 *
 * @return {Object}
 */
function testInventoryReceiptWriteAndRollback() {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const lock =
    LockService
      .getDocumentLock();

  let result = null;
  let stockRow = null;
  let movementRow = null;

  lock.waitLock(30000);

  try {
    assertInventoryModuleReady_();

    const stockSheet =
      ss.getSheetByName(
        INVENTORY_CONFIG
          .STOCK_SHEET_NAME
      );

    const movementSheet =
      ss.getSheetByName(
        INVENTORY_CONFIG
          .MOVEMENT_SHEET_NAME
      );

    const beforeState = {
      stockLastDataRow:
        findNextInventoryDataRow_(
          stockSheet
        ) - 1,

      movementLastDataRow:
        findNextInventoryDataRow_(
          movementSheet
        ) - 1
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

    const testId =
      'TEST-INV-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ) +
      '-' +
      Math.floor(
        Math.random() * 900 + 100
      );

    const data = {
      id:
        testId,

      date:
        operationDate,

      account:
        'Каса, грн',

      transferTo:
        '',

      type:
        'Витрати',

      category:
        'Медичні витрати',

      article:
        'Закупка вакцин',

      doctor:
        '',

      patient:
        '',

      unitPrice:
        150,

      quantity:
        2,

      amount:
        300,

      comment:
        'Автоматичний тест складського запису',

      inventoryName:
        'Тестова вакцина',

      inventorySeries:
        'TEST-SERIES-001',

      inventoryExpiryDate:
        expiryDate,

      inventorySupplier:
        'Тестовий постачальник',

      inventoryMinimumStock:
        2
    };

    const validation =
      validateInputOperation_(
        data
      );

    if (!validation.ok) {
      throw new Error(
        'Тестові дані не пройшли валідацію: ' +
        validation.message
      );
    }

    const writeResult =
      writeInventoryReceipt_(
        data
      );

    stockRow =
      writeResult.stockRow;

    movementRow =
      writeResult.movementRow;

    SpreadsheetApp.flush();

    const stockValues =
      stockSheet
        .getRange(
          stockRow,
          1,
          1,
          INVENTORY_CONFIG
            .STOCK_HEADERS
            .length
        )
        .getValues()[0];

    const movementValues =
      movementSheet
        .getRange(
          movementRow,
          1,
          1,
          INVENTORY_CONFIG
            .MOVEMENT_HEADERS
            .length
        )
        .getValues()[0];

    const checks = {
      stockOperationId:
        String(
          stockValues[1] || ''
        ).trim() === testId,

      movementOperationId:
        String(
          movementValues[1] || ''
        ).trim() === testId,

      sameLotId:
        String(
          stockValues[0] || ''
        ).trim() ===
        String(
          movementValues[5] || ''
        ).trim(),

      stockType:
        String(
          stockValues[2] || ''
        ).trim() ===
        'Вакцина',

      movementType:
        String(
          movementValues[6] || ''
        ).trim() ===
        'Надходження',

      stockQuantity:
        Number(
          stockValues[8]
        ) === 2,

      currentBalance:
        Number(
          stockValues[14]
        ) === 2,

      movementQuantity:
        Number(
          movementValues[7]
        ) === 2,

      stockTotal:
        Number(
          stockValues[10]
        ) === 300,

      movementTotal:
        Number(
          movementValues[9]
        ) === 300,

      minimumStock:
        Number(
          stockValues[15]
        ) === 2
    };

    const allChecksPassed =
      Object.keys(checks)
        .every(function(key) {
          return checks[key];
        });

    if (!allChecksPassed) {
      throw new Error(
        'Запис створено, але контрольні значення не збігаються'
      );
    }

    /*
     * Очищаємо тестові записи.
     */
    clearInventoryMovementRow_(
      movementRow
    );

    clearInventoryStockRow_(
      stockRow
    );

    SpreadsheetApp.flush();

    const testStockStillExists =
      inventoryValueExists_(
        stockSheet,
        2,
        testId
      );

    const testMovementStillExists =
      inventoryValueExists_(
        movementSheet,
        2,
        testId
      );

    const afterState = {
      stockLastDataRow:
        findNextInventoryDataRow_(
          stockSheet
        ) - 1,

      movementLastDataRow:
        findNextInventoryDataRow_(
          movementSheet
        ) - 1
    };

    result = {
      ok:
        allChecksPassed &&
        !testStockStillExists &&
        !testMovementStillExists,

      test:
        'testInventoryReceiptWriteAndRollback',

      operationId:
        testId,

      writeResult:
        writeResult,

      checks:
        checks,

      cleanup: {
        stockRecordRemoved:
          !testStockStillExists,

        movementRecordRemoved:
          !testMovementStillExists
      },

      beforeState:
        beforeState,

      afterState:
        afterState
    };

    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;

  } catch (error) {
    /*
     * Аварійне очищення,
     * якщо тест зупинився посередині.
     */
    if (movementRow) {
      try {
        clearInventoryMovementRow_(
          movementRow
        );
      } catch (cleanupError) {
        Logger.log(
          'Не вдалося очистити тестовий рух: ' +
          cleanupError.message
        );
      }
    }

    if (stockRow) {
      try {
        clearInventoryStockRow_(
          stockRow
        );
      } catch (cleanupError) {
        Logger.log(
          'Не вдалося очистити тестову партію: ' +
          cleanupError.message
        );
      }
    }

    const failedResult = {
      ok:
        false,

      test:
        'testInventoryReceiptWriteAndRollback',

      error:
        String(
          error &&
          error.message
            ? error.message
            : error
        ),

      emergencyCleanupAttempted:
        true
    };

    Logger.log(
      JSON.stringify(
        failedResult,
        null,
        2
      )
    );

    return failedResult;

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      Logger.log(
        'Не вдалося звільнити блокування: ' +
        error.message
      );
    }
  }
}
