/**
 * ОДНОРАЗОВЕ ВІДНОВЛЕННЯ ВТРАЧЕНОЇ ОПЕРАЦІЇ
 * ------------------------------------------------------------
 * Таблиця: ProFin OS 2026 — Альтернатива
 *
 * Відновлює ТІЛЬКИ L-20260722-856
 * у листі «База операцій».
 */

const RESTORE_L20260722856_CONFIG = Object.freeze({
  writeEnabled: false,
  rollbackEnabled: false,

  baseSheetName: 'База операцій',
  stockSheetName: 'Склад медичних запасів',
  movementSheetName: 'Рух складу',

  baseColumnCount: 33, // A:AG

  operationId: 'L-20260722-856',
  lotId: 'L-20260722-856-LOT-1',
  movementId: 'L-20260722-856-MOV-IN-1',

  account: 'Рахунок Моно, грн',
  doctor: 'Карпенко',

  inventoryType: 'Вакцина',
  inventoryName: 'Тетраксим',
  series: 'Y3C54D4',

  unitPrice: 1000,
  quantity: 6,
  amount: -6000,

  soldOrUsed: 3,
  currentBalance: 0,

  operationType: 'Витрати',
  category: 'Медичні витрати',
  article: 'Закупка вакцин',

  recordStatus: 'Проведено',
  stockStatus: 'Закрита',

  originalUser: 'pediatr.karpenko2@gmail.com',

  transactionDate: Object.freeze([2026, 7, 22]),
  expiryDate: Object.freeze([2027, 1, 31]),
  creationTime: Object.freeze([14, 11, 53]),

  propertyKey: 'RESTORE_L20260722856_SNAPSHOT_V1'
});


/**
 * СУХИЙ ТЕСТ.
 * Нічого не записує.
 */
function previewRestoreMissingBaseOperationL20260722856() {
  const result =
    buildRestoreL20260722856Plan_();

  Logger.log(
    'SUMMARY: ' +
    JSON.stringify({
      ok: result.ok,
      test: result.test,
      writesNow: false,
      status: result.status,
      operationId: result.operationId,
      baseMatchCount: result.baseMatchCount,
      stockRow: result.stockRow,
      movementRow: result.movementRow,
      readyToRestore: result.readyToRestore
    })
  );

  Logger.log(
    'PLANNED_BASE_ROW: ' +
    JSON.stringify(
      result.plannedBaseRow
    )
  );

  return result;
}


/**
 * РОБОЧЕ ВІДНОВЛЕННЯ.
 *
 * Поки writeEnabled: false —
 * функція не дозволить виконати запис.
 */
function restoreMissingBaseOperationL20260722856() {
  const config =
    RESTORE_L20260722856_CONFIG;

  if (
    config.writeEnabled !== true
  ) {
    throw new Error(
      'Запис заблоковано. ' +
      'Спочатку виконайте dry-run, ' +
      'а після перевірки змініть ' +
      'writeEnabled на true.'
    );
  }

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  let targetRange = null;
  let targetRow = null;
  let propertyWritten = false;

  try {
    const plan =
      buildRestoreL20260722856Plan_();

    /*
     * Повторний запуск не створює дубль.
     */
    if (
      plan.status ===
      'ALREADY_EXISTS'
    ) {
      const result = {
        ok: true,
        writesNow: false,
        skipped: true,
        status: 'ALREADY_EXISTS',
        operationId:
          config.operationId,
        existingRows:
          plan.baseRows
      };

      Logger.log(
        'RESULT: ' +
        JSON.stringify(result)
      );

      return result;
    }

    if (
      !plan.readyToRestore
    ) {
      throw new Error(
        'Відновлення зупинено: ' +
        'джерельні дані не пройшли перевірку.'
      );
    }

    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const baseSheet =
      spreadsheet.getSheetByName(
        config.baseSheetName
      );

    targetRow =
      findNextEmptyBaseRowL20260722856_(
        baseSheet
      );

    targetRange =
      baseSheet.getRange(
        targetRow,
        1,
        1,
        config.baseColumnCount
      );

    /*
     * Не дозволяємо перезаписати
     * непорожній рядок.
     */
    const preWriteValues =
      targetRange
        .getDisplayValues()[0];

    const targetHasContent =
      preWriteValues.some(
        function(value) {
          return (
            normalizeL20260722856_(
              value
            ) !== ''
          );
        }
      );

    if (
      targetHasContent
    ) {
      throw new Error(
        'Цільовий рядок ' +
        targetRow +
        ' не є порожнім.'
      );
    }

    /*
     * Копіюємо лише форматування
     * останнього робочого рядка.
     */
    const lastDataRow =
      findLastIdRowL20260722856_(
        baseSheet
      );

    if (
      lastDataRow >= 2 &&
      lastDataRow !== targetRow
    ) {
      baseSheet
        .getRange(
          lastDataRow,
          1,
          1,
          config.baseColumnCount
        )
        .copyTo(
          targetRange,
          SpreadsheetApp
            .CopyPasteType
            .PASTE_FORMAT,
          false
        );
    }

    const rowData =
      buildBaseRowL20260722856_();

    targetRange.setValues([
      rowData
    ]);

    applyBaseFormatsL20260722856_(
      baseSheet,
      targetRow
    );

    SpreadsheetApp.flush();

    /*
     * Контрольне читання після запису.
     */
    verifyWrittenBaseRowL20260722856_(
      baseSheet,
      targetRow
    );

    /*
     * Зберігаємо номер створеного рядка
     * для можливого контрольованого відкату.
     */
    const snapshot = {
      version: 1,
      operationId:
        config.operationId,
      sheetName:
        config.baseSheetName,
      row:
        targetRow,
      restoredAt:
        new Date().toISOString()
    };

    PropertiesService
      .getDocumentProperties()
      .setProperty(
        config.propertyKey,
        JSON.stringify(
          snapshot
        )
      );

    propertyWritten = true;

    const result = {
      ok: true,
      writesNow: true,
      status: 'RESTORED',

      operationId:
        config.operationId,

      restoredRow:
        targetRow,

      changedSheets: [
        config.baseSheetName
      ],

      unchangedSheets: [
        config.stockSheetName,
        config.movementSheetName,
        'Переміщення між філіями',
        'Облік вакцин',
        'Нарахування'
      ]
    };

    Logger.log(
      'RESULT: ' +
      JSON.stringify(result)
    );

    SpreadsheetApp
      .getActive()
      .toast(
        'Операцію ' +
        config.operationId +
        ' відновлено в «Базі операцій», рядок ' +
        targetRow,
        'Відновлення завершено',
        10
      );

    return result;

  } catch (error) {
    /*
     * Автоматичний відкат
     * лише власного незавершеного запису.
     */
    if (
      targetRange
    ) {
      try {
        targetRange.clearContent();
        SpreadsheetApp.flush();

      } catch (rollbackError) {
        Logger.log(
          'AUTO_ROLLBACK_ERROR: ' +
          rollbackError.message
        );
      }
    }

    if (
      propertyWritten
    ) {
      try {
        PropertiesService
          .getDocumentProperties()
          .deleteProperty(
            config.propertyKey
          );

      } catch (propertyError) {
        Logger.log(
          'PROPERTY_ROLLBACK_ERROR: ' +
          propertyError.message
        );
      }
    }

    Logger.log(
      'RESTORE_ERROR: ' +
      JSON.stringify({
        operationId:
          config.operationId,

        targetRow:
          targetRow,

        message:
          error.message
      })
    );

    throw error;

  } finally {
    lock.releaseLock();
  }
}


/**
 * РУЧНИЙ КОНТРОЛЬОВАНИЙ ВІДКАТ.
 *
 * Працює лише для рядка,
 * створеного функцією відновлення.
 *
 * Для запуску потрібно окремо встановити:
 * rollbackEnabled: true
 */
function rollbackRestoredBaseOperationL20260722856() {
  const config =
    RESTORE_L20260722856_CONFIG;

  if (
    config.rollbackEnabled !== true
  ) {
    throw new Error(
      'Ручний відкат заблоковано. ' +
      'Для свідомого відкату встановіть ' +
      'rollbackEnabled: true.'
    );
  }

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  try {
    const properties =
      PropertiesService
        .getDocumentProperties();

    const rawSnapshot =
      properties.getProperty(
        config.propertyKey
      );

    if (
      !rawSnapshot
    ) {
      throw new Error(
        'Не знайдено контрольний запис ' +
        'цього відновлення. Відкат зупинено.'
      );
    }

    const snapshot =
      JSON.parse(
        rawSnapshot
      );

    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const baseSheet =
      spreadsheet.getSheetByName(
        config.baseSheetName
      );

    if (
      !baseSheet
    ) {
      throw new Error(
        'Не знайдено лист «База операцій».'
      );
    }

    const row =
      Number(
        snapshot.row
      );

    if (
      !row ||
      row < 2
    ) {
      throw new Error(
        'Некоректний номер рядка ' +
        'у контрольному записі.'
      );
    }

    /*
     * Перед очищенням перевіряємо,
     * що це саме відновлений рядок.
     */
    verifyWrittenBaseRowL20260722856_(
      baseSheet,
      row
    );

    baseSheet
      .getRange(
        row,
        1,
        1,
        config.baseColumnCount
      )
      .clearContent();

    SpreadsheetApp.flush();

    properties.deleteProperty(
      config.propertyKey
    );

    const result = {
      ok: true,
      writesNow: true,
      status: 'ROLLED_BACK',
      operationId:
        config.operationId,
      clearedRow:
        row
    };

    Logger.log(
      'RESULT: ' +
      JSON.stringify(result)
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Формує план та перевіряє
 * джерельні складські записи.
 */
function buildRestoreL20260722856Plan_() {
  const config =
    RESTORE_L20260722856_CONFIG;

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const baseSheet =
    spreadsheet.getSheetByName(
      config.baseSheetName
    );

  const stockSheet =
    spreadsheet.getSheetByName(
      config.stockSheetName
    );

  const movementSheet =
    spreadsheet.getSheetByName(
      config.movementSheetName
    );

  if (
    !baseSheet ||
    !stockSheet ||
    !movementSheet
  ) {
    throw new Error(
      'Не знайдено один із потрібних листів: ' +
      '«База операцій», ' +
      '«Склад медичних запасів» або ' +
      '«Рух складу».'
    );
  }

  if (
    baseSheet.getMaxColumns() <
    config.baseColumnCount
  ) {
    throw new Error(
      'У «Базі операцій» ' +
      'менше 33 колонок A:AG.'
    );
  }

  /*
   * Перевірка дубля у Базі операцій.
   */
  const baseRows =
    findRowsByExactValueL20260722856_(
      baseSheet,
      1,
      config.operationId,
      2
    );

  if (
    baseRows.length > 0
  ) {
    return {
      ok: true,

      test:
        'previewRestoreMissingBaseOperationL20260722856',

      writesNow: false,

      status:
        'ALREADY_EXISTS',

      operationId:
        config.operationId,

      baseMatchCount:
        baseRows.length,

      baseRows:
        baseRows,

      stockRow:
        null,

      movementRow:
        null,

      readyToRestore:
        false,

      plannedBaseRow:
        buildReadableBaseRowL20260722856_()
    };
  }

  /*
   * Перевірка партії на складі.
   */
  const stockRows =
    findRowsByExactValueL20260722856_(
      stockSheet,
      1,
      config.lotId,
      3
    );

  if (
    stockRows.length !== 1
  ) {
    throw new Error(
      'Очікувався один складський рядок партії ' +
      config.lotId +
      ', знайдено: ' +
      stockRows.length +
      '.'
    );
  }

  /*
   * Перевірка первинного руху надходження.
   */
  const movementRows =
    findRowsByExactValueL20260722856_(
      movementSheet,
      1,
      config.movementId,
      2
    );

  if (
    movementRows.length !== 1
  ) {
    throw new Error(
      'Очікувався один рух ' +
      config.movementId +
      ', знайдено: ' +
      movementRows.length +
      '.'
    );
  }

  verifyStockSourceL20260722856_(
    stockSheet,
    stockRows[0]
  );

  verifyMovementSourceL20260722856_(
    movementSheet,
    movementRows[0]
  );

  return {
    ok: true,

    test:
      'previewRestoreMissingBaseOperationL20260722856',

    writesNow:
      false,

    status:
      'READY_TO_RESTORE',

    operationId:
      config.operationId,

    baseMatchCount:
      0,

    baseRows:
      [],

    stockRow:
      stockRows[0],

    movementRow:
      movementRows[0],

    readyToRestore:
      true,

    plannedBaseRow:
      buildReadableBaseRowL20260722856_()
  };
}


/**
 * Перевіряє складську партію A:Q.
 */
function verifyStockSourceL20260722856_(
  sheet,
  row
) {
  const config =
    RESTORE_L20260722856_CONFIG;

  if (
    sheet.getMaxColumns() < 17
  ) {
    throw new Error(
      'На листі «Склад медичних запасів» ' +
      'бракує колонок A:Q.'
    );
  }

  const values =
    sheet
      .getRange(
        row,
        1,
        1,
        17
      )
      .getValues()[0];

  const checks = [
    [
      normalizeL20260722856_(
        values[0]
      ) === config.lotId,
      'ID партії'
    ],
    [
      normalizeL20260722856_(
        values[2]
      ) === config.inventoryType,
      'тип запасу'
    ],
    [
      normalizeL20260722856_(
        values[3]
      ) === config.inventoryName,
      'найменування'
    ],
    [
      normalizeL20260722856_(
        values[4]
      ) === config.series,
      'серія'
    ],
    [
      sameDateL20260722856_(
        values[5],
        config.expiryDate
      ),
      'термін придатності'
    ],
    [
      sameDateL20260722856_(
        values[6],
        config.transactionDate
      ),
      'дата надходження'
    ],
    [
      sameNumberL20260722856_(
        values[8],
        config.quantity
      ),
      'прийнята кількість'
    ],
    [
      sameNumberL20260722856_(
        values[9],
        config.unitPrice
      ),
      'собівартість одиниці'
    ],
    [
      sameNumberL20260722856_(
        values[10],
        Math.abs(
          config.amount
        )
      ),
      'загальна вартість'
    ],
    [
      sameNumberL20260722856_(
        values[11],
        config.soldOrUsed
      ),
      'продано/використано'
    ],
    [
      sameNumberL20260722856_(
        values[14],
        config.currentBalance
      ),
      'поточний залишок'
    ],
    [
      normalizeL20260722856_(
        values[16]
      ) === config.stockStatus,
      'статус партії'
    ]
  ];

  const failed =
    checks
      .filter(
        function(check) {
          return !check[0];
        }
      )
      .map(
        function(check) {
          return check[1];
        }
      );

  if (
    failed.length
  ) {
    throw new Error(
      'Складський рядок ' +
      row +
      ' не відповідає підтвердженим даним: ' +
      failed.join(', ') +
      '.'
    );
  }
}


/**
 * Перевіряє первинний рух надходження A:L.
 */
function verifyMovementSourceL20260722856_(
  sheet,
  row
) {
  const config =
    RESTORE_L20260722856_CONFIG;

  if (
    sheet.getMaxColumns() < 12
  ) {
    throw new Error(
      'На листі «Рух складу» ' +
      'бракує колонок A:L.'
    );
  }

  const values =
    sheet
      .getRange(
        row,
        1,
        1,
        12
      )
      .getValues()[0];

  const checks = [
    [
      normalizeL20260722856_(
        values[0]
      ) === config.movementId,
      'ID руху'
    ],
    [
      normalizeL20260722856_(
        values[1]
      ) === config.operationId,
      'ID операції'
    ],
    [
      sameDateL20260722856_(
        values[2],
        config.transactionDate
      ),
      'дата'
    ],
    [
      normalizeL20260722856_(
        values[3]
      ) === config.inventoryType,
      'тип запасу'
    ],
    [
      normalizeL20260722856_(
        values[4]
      ) === config.inventoryName,
      'найменування'
    ],
    [
      normalizeL20260722856_(
        values[5]
      ) === config.lotId,
      'ID партії'
    ],
    [
      normalizeL20260722856_(
        values[6]
      ) === 'Надходження',
      'тип руху'
    ],
    [
      sameNumberL20260722856_(
        values[7],
        config.quantity
      ),
      'кількість'
    ],
    [
      sameNumberL20260722856_(
        values[8],
        config.unitPrice
      ),
      'собівартість одиниці'
    ],
    [
      sameNumberL20260722856_(
        values[9],
        Math.abs(
          config.amount
        )
      ),
      'загальна собівартість'
    ],
    [
      normalizeL20260722856_(
        values[10]
      ) === config.originalUser,
      'користувач'
    ]
  ];

  const failed =
    checks
      .filter(
        function(check) {
          return !check[0];
        }
      )
      .map(
        function(check) {
          return check[1];
        }
      );

  if (
    failed.length
  ) {
    throw new Error(
      'Рух складу ' +
      row +
      ' не відповідає підтвердженим даним: ' +
      failed.join(', ') +
      '.'
    );
  }
}


/**
 * Формує рядок A:AG.
 */
function buildBaseRowL20260722856_() {
  const config =
    RESTORE_L20260722856_CONFIG;

  const transactionDate =
    makeDateL20260722856_(
      config.transactionDate
    );

  const monthDate =
    new Date(
      2026,
      6,
      1
    );

  const creationDate =
    makeDateL20260722856_(
      config.transactionDate
    );

  const creationTime =
    new Date(
      1899,
      11,
      30,
      config.creationTime[0],
      config.creationTime[1],
      config.creationTime[2]
    );

  return [
    config.operationId,       // A  ID
    config.account,           // B  Рахунок
    '',                       // C  На рахунок
    transactionDate,          // D  Дата транзакції
    config.unitPrice,         // E  Ціна за одиницю
    config.quantity,          // F  Кількість
    config.amount,            // G  Сума
    config.doctor,            // H  Лікар
    '',                       // I  Пацієнт
    config.operationType,     // J  Тип доходу / витрати
    config.category,          // K  Категорія
    config.article,           // L  Стаття
    '',                       // M  Коментар
    monthDate,                // N  Місяць оплати
    monthDate,                // O  Місяць нарахування
    config.operationType,     // P  Тип обліку
    '',                       // Q  Пакет
    '',                       // R  Дата старту пакету
    '',                       // S  Тривалість пакету
    '',                       // T  Сума на місяць
    '',                       // U  Назва вакцини
    config.quantity,          // V  Кількість вакцин
    '',                       // W  Дата використання
    '',                       // X  Собівартість вакцини
    '',                       // Y  ID вакцини
    '',                       // Z  Назва активу
    '',                       // AA Категорія активу
    '',                       // AB Строк амортизації
    '',                       // AC Дата введення
    config.recordStatus,      // AD Статус запису
    creationDate,             // AE Дата створення
    creationTime,             // AF Час створення
    config.originalUser       // AG Створив користувач
  ];
}


/**
 * Дані для журналу dry-run.
 */
function buildReadableBaseRowL20260722856_() {
  const config =
    RESTORE_L20260722856_CONFIG;

  return {
    id:
      config.operationId,

    account:
      config.account,

    transactionDate:
      '22.07.2026',

    unitPrice:
      config.unitPrice,

    quantity:
      config.quantity,

    amount:
      config.amount,

    doctor:
      config.doctor,

    type:
      config.operationType,

    category:
      config.category,

    article:
      config.article,

    paymentMonth:
      'Липень 2026',

    accrualMonth:
      'Липень 2026',

    vaccineQuantity:
      config.quantity,

    status:
      config.recordStatus,

    createdAt:
      '22.07.2026 14:11:53',

    createdBy:
      config.originalUser
  };
}


/**
 * Перевіряє записаний рядок.
 */
function verifyWrittenBaseRowL20260722856_(
  sheet,
  row
) {
  const config =
    RESTORE_L20260722856_CONFIG;

  const values =
    sheet
      .getRange(
        row,
        1,
        1,
        config.baseColumnCount
      )
      .getValues()[0];

  const checks = [
    [
      normalizeL20260722856_(
        values[0]
      ) === config.operationId,
      'ID'
    ],
    [
      normalizeL20260722856_(
        values[1]
      ) === config.account,
      'рахунок'
    ],
    [
      sameDateL20260722856_(
        values[3],
        config.transactionDate
      ),
      'дата транзакції'
    ],
    [
      sameNumberL20260722856_(
        values[4],
        config.unitPrice
      ),
      'ціна'
    ],
    [
      sameNumberL20260722856_(
        values[5],
        config.quantity
      ),
      'кількість'
    ],
    [
      sameNumberL20260722856_(
        values[6],
        config.amount
      ),
      'сума'
    ],
    [
      normalizeL20260722856_(
        values[7]
      ) === config.doctor,
      'лікар'
    ],
    [
      normalizeL20260722856_(
        values[9]
      ) === config.operationType,
      'тип'
    ],
    [
      normalizeL20260722856_(
        values[10]
      ) === config.category,
      'категорія'
    ],
    [
      normalizeL20260722856_(
        values[11]
      ) === config.article,
      'стаття'
    ],
    [
      sameDateL20260722856_(
        values[13],
        [2026, 7, 1]
      ),
      'місяць оплати'
    ],
    [
      sameDateL20260722856_(
        values[14],
        [2026, 7, 1]
      ),
      'місяць нарахування'
    ],
    [
      normalizeL20260722856_(
        values[15]
      ) === config.operationType,
      'тип обліку'
    ],
    [
      sameNumberL20260722856_(
        values[21],
        config.quantity
      ),
      'кількість вакцин'
    ],
    [
      normalizeL20260722856_(
        values[29]
      ) === config.recordStatus,
      'статус'
    ],
    [
      sameDateL20260722856_(
        values[30],
        config.transactionDate
      ),
      'дата створення'
    ],
    [
      sameTimeL20260722856_(
        values[31],
        config.creationTime
      ),
      'час створення'
    ],
    [
      normalizeL20260722856_(
        values[32]
      ) === config.originalUser,
      'користувач'
    ]
  ];

  const failed =
    checks
      .filter(
        function(check) {
          return !check[0];
        }
      )
      .map(
        function(check) {
          return check[1];
        }
      );

  if (
    failed.length
  ) {
    throw new Error(
      'Після запису не пройшла перевірка: ' +
      failed.join(', ') +
      '.'
    );
  }
}


/**
 * Форматування нового рядка.
 */
function applyBaseFormatsL20260722856_(
  sheet,
  row
) {
  sheet
    .getRange(
      row,
      4
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(
      row,
      5,
      1,
      3
    )
    .setNumberFormat(
      '#,##0.00'
    );

  sheet
    .getRange(
      row,
      14,
      1,
      2
    )
    .setNumberFormat(
      'mmmm yyyy'
    );

  sheet
    .getRange(
      row,
      23
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(
      row,
      29
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(
      row,
      31
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(
      row,
      32
    )
    .setNumberFormat(
      'HH:mm:ss'
    );
}


/**
 * Шукає точні збіги у визначеній колонці.
 */
function findRowsByExactValueL20260722856_(
  sheet,
  column,
  expectedValue,
  startRow
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < startRow
  ) {
    return [];
  }

  const values =
    sheet
      .getRange(
        startRow,
        column,
        lastRow - startRow + 1,
        1
      )
      .getDisplayValues()
      .flat();

  const expected =
    normalizeL20260722856_(
      expectedValue
    );

  const rows = [];

  values.forEach(
    function(value, index) {
      if (
        normalizeL20260722856_(
          value
        ) === expected
      ) {
        rows.push(
          startRow + index
        );
      }
    }
  );

  return rows;
}


/**
 * Визначає останній рядок,
 * у якому заповнена колонка A.
 */
function findLastIdRowL20260722856_(
  sheet
) {
  const lastRow =
    Math.max(
      sheet.getLastRow(),
      2
    );

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  for (
    let index =
      values.length - 1;
    index >= 0;
    index--
  ) {
    if (
      normalizeL20260722856_(
        values[index]
      )
    ) {
      return index + 2;
    }
  }

  return 1;
}


/**
 * Знаходить наступний повністю порожній
 * рядок A:AG після останнього ID.
 */
function findNextEmptyBaseRowL20260722856_(
  sheet
) {
  const config =
    RESTORE_L20260722856_CONFIG;

  let row =
    findLastIdRowL20260722856_(
      sheet
    ) + 1;

  while (
    row <=
    sheet.getMaxRows()
  ) {
    const values =
      sheet
        .getRange(
          row,
          1,
          1,
          config.baseColumnCount
        )
        .getDisplayValues()[0];

    const isEmpty =
      values.every(
        function(value) {
          return (
            normalizeL20260722856_(
              value
            ) === ''
          );
        }
      );

    if (
      isEmpty
    ) {
      return row;
    }

    row += 1;
  }

  sheet.insertRowAfter(
    sheet.getMaxRows()
  );

  return sheet.getMaxRows();
}


/**
 * Нормалізація тексту.
 */
function normalizeL20260722856_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  ).trim();
}


/**
 * Порівняння чисел.
 */
function sameNumberL20260722856_(
  actual,
  expected
) {
  const actualNumber =
    Number(actual);

  const expectedNumber =
    Number(expected);

  return (
    Number.isFinite(
      actualNumber
    ) &&
    Number.isFinite(
      expectedNumber
    ) &&
    Math.abs(
      actualNumber -
      expectedNumber
    ) < 0.000001
  );
}


/**
 * Порівняння дати.
 */
function sameDateL20260722856_(
  actual,
  expectedParts
) {
  if (
    !(actual instanceof Date) ||
    isNaN(
      actual.getTime()
    )
  ) {
    return false;
  }

  return (
    actual.getFullYear() ===
      expectedParts[0] &&
    actual.getMonth() + 1 ===
      expectedParts[1] &&
    actual.getDate() ===
      expectedParts[2]
  );
}


/**
 * Порівняння часу.
 */
function sameTimeL20260722856_(
  actual,
  expectedParts
) {
  if (
    !(actual instanceof Date) ||
    isNaN(
      actual.getTime()
    )
  ) {
    return false;
  }

  return (
    actual.getHours() ===
      expectedParts[0] &&
    actual.getMinutes() ===
      expectedParts[1] &&
    actual.getSeconds() ===
      expectedParts[2]
  );
}


/**
 * Створення дати з масиву:
 * [рік, місяць, день].
 */
function makeDateL20260722856_(
  parts
) {
  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2]
  );
}