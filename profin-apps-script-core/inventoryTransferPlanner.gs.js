/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПЕРЕМІЩЕННЯ
 * КРОК 2. СУХИЙ ПЛАНУВАЛЬНИК
 *
 * ПРИЗНАЧЕННЯ:
 * 1. Читає вибрану складську партію.
 * 2. Перевіряє можливість переміщення.
 * 3. Перевіряє філію-одержувача.
 * 4. Розраховує залишок і собівартість.
 * 5. Формує план майбутньої передачі.
 *
 * ВАЖЛИВО:
 * — не змінює склад;
 * — не створює рухів;
 * — не записує журнал;
 * — не записує дані в іншу таблицю.
 ****************************************************/


/****************************************************
 * КОНФІГУРАЦІЯ ПЛАНУВАЛЬНИКА
 ****************************************************/

const INTERBRANCH_TRANSFER_PLANNER_CONFIG =
  Object.freeze({

    version:
      '1.0',

    stockColumnCount:
      28,

    tolerance:
      0.000001,

    /*
     * Індекси колонок A:AB.
     * Відлік у масиві починається з нуля.
     */
    stockColumns:
      Object.freeze({

        lotId:
          0,  // A

        receiptOperationId:
          1,  // B

        inventoryType:
          2,  // C

        inventoryName:
          3,  // D

        series:
          4,  // E

        expiryDate:
          5,  // F

        receiptDate:
          6,  // G

        supplier:
          7,  // H

        received:
          8,  // I

        unitCost:
          9,  // J

        totalPurchaseCost:
          10, // K

        soldOrUsed:
          11, // L

        transferredToStorage:
          12, // M

        writtenOff:
          13, // N

        currentBalance:
          14, // O

        minimumStock:
          15, // P

        lotStatus:
          16, // Q

        user:
          17, // R

        createdAt:
          18, // S

        transferId:
          19, // T

        sourceBranch:
          20, // U

        destinationBranch:
          21, // V

        transferQuantity:
          22, // W

        transferStatus:
          23, // X

        transferAction:
          24, // Y

        transferDateTime:
          25, // Z

        transferUser:
          26, // AA

        transferredToBranches:
          27  // AB
      }),

    blockedLotStatuses:
      Object.freeze([
        'Закрита',
        'Прострочена',
        'Заблокована'
      ]),

    pendingTransferStatuses:
      Object.freeze([
        'Очікує приймання',
        'Передано — очікує приймання',
        'Переміщується',
        'Передано'
      ])
  });


/****************************************************
 * НОРМАЛІЗАЦІЯ ТЕКСТУ
 ****************************************************/

function interbranchPlannerNormalize_(
  value
) {
  let text =
    String(
      value === null ||
      value === undefined
        ? ''
        : value
    );

  if (
    typeof text.normalize ===
    'function'
  ) {
    text =
      text.normalize(
        'NFKC'
      );
  }

  return text
    .replace(
      /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
      ''
    )
    .replace(
      /\u00A0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toLowerCase();
}


/****************************************************
 * БЕЗПЕЧНЕ ЧИТАННЯ ЧИСЛА
 ****************************************************/

function interbranchPlannerNumber_(
  value
) {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const text =
    String(value || '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

  const result =
    Number(text);

  return Number.isFinite(result)
    ? result
    : 0;
}


/****************************************************
 * ОКРУГЛЕННЯ ГРОШЕЙ
 ****************************************************/

function interbranchPlannerRoundMoney_(
  value
) {
  return Math.round(
    (
      interbranchPlannerNumber_(
        value
      ) +
      Number.EPSILON
    ) * 100
  ) / 100;
}


/****************************************************
 * НОРМАЛІЗАЦІЯ ДАТИ
 ****************************************************/

function interbranchPlannerDateOnly_(
  value
) {
  if (
    !(
      value instanceof Date
    ) ||
    isNaN(
      value.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  );
}


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assertInterbranchPlannerDependencies_() {
  if (
    typeof INTERBRANCH_TRANSFER_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_CONFIG. ' +
      'Спочатку додайте модуль inventoryTransferConfig.gs.'
    );
  }

  if (
    typeof getCurrentInterbranchBranch_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію getCurrentInterbranchBranch_().'
    );
  }

  if (
    typeof getRemoteInterbranchBranch_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію getRemoteInterbranchBranch_().'
    );
  }

  if (
    typeof checkInterbranchSheetStructure_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію checkInterbranchSheetStructure_().'
    );
  }

  return true;
}


/****************************************************
 * ЧИТАННЯ ПАРТІЇ ЗІ СКЛАДУ
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row
 * @return {Object}
 ****************************************************/

function getInterbranchTransferSourceLot_(
  sheet,
  row
) {
  if (!sheet) {
    throw new Error(
      'Не передано лист складу'
    );
  }

  if (
    sheet.getName() !==
    INTERBRANCH_TRANSFER_CONFIG
      .sheetNames
      .stock
  ) {
    throw new Error(
      'Очікується лист "' +
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock +
      '", отримано "' +
      sheet.getName() +
      '"'
    );
  }

  const sourceRow =
    Number(row) || 0;

  if (sourceRow < 2) {
    throw new Error(
      'Потрібно вибрати рядок складської партії, починаючи з рядка 2'
    );
  }

  if (
    sourceRow >
    sheet.getLastRow()
  ) {
    throw new Error(
      'Рядок ' +
      sourceRow +
      ' знаходиться за межами складських даних'
    );
  }

  const values =
    sheet
      .getRange(
        sourceRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const lotId =
    String(
      values[
        columns.lotId
      ] || ''
    ).trim();

  if (!lotId) {
    throw new Error(
      'У рядку ' +
      sourceRow +
      ' не визначено ID партії'
    );
  }

  return {
    sheetRow:
      sourceRow,

    lotId:
      lotId,

    receiptOperationId:
      String(
        values[
          columns.receiptOperationId
        ] || ''
      ).trim(),

    inventoryType:
      String(
        values[
          columns.inventoryType
        ] || ''
      ).trim(),

    inventoryName:
      String(
        values[
          columns.inventoryName
        ] || ''
      ).trim(),

    series:
      String(
        values[
          columns.series
        ] || ''
      ).trim(),

    expiryDate:
      interbranchPlannerDateOnly_(
        values[
          columns.expiryDate
        ]
      ),

    receiptDate:
      interbranchPlannerDateOnly_(
        values[
          columns.receiptDate
        ]
      ),

    supplier:
      String(
        values[
          columns.supplier
        ] || ''
      ).trim(),

    received:
      interbranchPlannerNumber_(
        values[
          columns.received
        ]
      ),

    unitCost:
      interbranchPlannerRoundMoney_(
        values[
          columns.unitCost
        ]
      ),

    totalPurchaseCost:
      interbranchPlannerRoundMoney_(
        values[
          columns.totalPurchaseCost
        ]
      ),

    soldOrUsed:
      interbranchPlannerNumber_(
        values[
          columns.soldOrUsed
        ]
      ),

    transferredToStorage:
      interbranchPlannerNumber_(
        values[
          columns.transferredToStorage
        ]
      ),

    writtenOff:
      interbranchPlannerNumber_(
        values[
          columns.writtenOff
        ]
      ),

    currentBalance:
      interbranchPlannerNumber_(
        values[
          columns.currentBalance
        ]
      ),

    minimumStock:
      interbranchPlannerNumber_(
        values[
          columns.minimumStock
        ]
      ),

    lotStatus:
      String(
        values[
          columns.lotStatus
        ] || ''
      ).trim(),

    currentTransferId:
      String(
        values[
          columns.transferId
        ] || ''
      ).trim(),

    currentTransferSourceBranch:
      String(
        values[
          columns.sourceBranch
        ] || ''
      ).trim(),

    currentTransferDestinationBranch:
      String(
        values[
          columns.destinationBranch
        ] || ''
      ).trim(),

    currentTransferQuantity:
      interbranchPlannerNumber_(
        values[
          columns.transferQuantity
        ]
      ),

    currentTransferStatus:
      String(
        values[
          columns.transferStatus
        ] || ''
      ).trim(),

    currentTransferAction:
      String(
        values[
          columns.transferAction
        ] || ''
      ).trim(),

    transferredToBranches:
      interbranchPlannerNumber_(
        values[
          columns.transferredToBranches
        ]
      ),

    rawValues:
      values.slice()
  };
}


/****************************************************
 * ПЕРЕВІРКА СТАТУСУ ПАРТІЇ
 ****************************************************/

function isInterbranchLotStatusBlocked_(
  status
) {
  const normalizedStatus =
    interbranchPlannerNormalize_(
      status
    );

  return INTERBRANCH_TRANSFER_PLANNER_CONFIG
    .blockedLotStatuses
    .some(
      function(blockedStatus) {
        return (
          interbranchPlannerNormalize_(
            blockedStatus
          ) ===
          normalizedStatus
        );
      }
    );
}


/****************************************************
 * ПЕРЕВІРКА НЕЗАВЕРШЕНОГО ПЕРЕМІЩЕННЯ
 ****************************************************/

function isInterbranchTransferPending_(
  status
) {
  const normalizedStatus =
    interbranchPlannerNormalize_(
      status
    );

  if (!normalizedStatus) {
    return false;
  }

  return INTERBRANCH_TRANSFER_PLANNER_CONFIG
    .pendingTransferStatuses
    .some(
      function(pendingStatus) {
        return (
          interbranchPlannerNormalize_(
            pendingStatus
          ) ===
          normalizedStatus
        );
      }
    );
}


/****************************************************
 * ФОРМУВАННЯ ID ПЕРЕМІЩЕННЯ
 *
 * На етапі сухого планування це лише
 * попередній ID. У таблицю він не записується.
 ****************************************************/

function buildInterbranchTransferId_(
  sourceBranch,
  destinationBranch
) {
  const sourceCode =
    String(
      sourceBranch &&
      sourceBranch.code
        ? sourceBranch.code
        : 'SRC'
    ).trim();

  const destinationCode =
    String(
      destinationBranch &&
      destinationBranch.code
        ? destinationBranch.code
        : 'DST'
    ).trim();

  const timestamp =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    );

  const suffix =
    Utilities
      .getUuid()
      .replace(/-/g, '')
      .substring(0, 6)
      .toUpperCase();

  return (
    'TRF-' +
    sourceCode +
    '-' +
    destinationCode +
    '-' +
    timestamp +
    '-' +
    suffix
  );
}


/****************************************************
 * ПЕРЕВІРКА ПЛАНУ ПЕРЕМІЩЕННЯ
 *
 * Нічого не записує.
 *
 * @param {Object} context
 * @return {Object}
 ****************************************************/

function validateInterbranchTransferPlan_(
  context
) {
  const errors = [];
  const warnings = [];

  const lot =
    context && context.lot
      ? context.lot
      : null;

  const sourceBranch =
    context && context.sourceBranch
      ? context.sourceBranch
      : null;

  const destinationBranch =
    context && context.destinationBranch
      ? context.destinationBranch
      : null;

  const quantity =
    interbranchPlannerNumber_(
      context
        ? context.quantity
        : 0
    );

  const operationDate =
    interbranchPlannerDateOnly_(
      context &&
      context.operationDate
        ? context.operationDate
        : new Date()
    );

  if (!lot) {
    errors.push(
      'Не передано складську партію'
    );
  }

  if (!sourceBranch) {
    errors.push(
      'Не визначено філію-відправника'
    );
  }

  if (!destinationBranch) {
    errors.push(
      'Не визначено філію-одержувача'
    );
  }

  if (
    sourceBranch &&
    destinationBranch &&
    sourceBranch.name ===
      destinationBranch.name
  ) {
    errors.push(
      'Філія-одержувач не може збігатися з філією-відправником'
    );
  }

  if (
    quantity <=
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    errors.push(
      'Кількість переміщення має бути більшою за нуль'
    );
  }

  if (lot) {
    if (!lot.inventoryType) {
      errors.push(
        'У партії не визначено тип запасу'
      );
    }

    if (!lot.inventoryName) {
      errors.push(
        'У партії не визначено найменування'
      );
    }

    if (
      lot.currentBalance <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance
    ) {
      errors.push(
        'Партія не має доступного залишку'
      );
    }

    if (
      quantity >
      lot.currentBalance +
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .tolerance
    ) {
      errors.push(
        'Недостатньо залишку для переміщення. ' +
        'Потрібно: ' +
        quantity +
        ', доступно: ' +
        lot.currentBalance
      );
    }

    if (
      isInterbranchLotStatusBlocked_(
        lot.lotStatus
      )
    ) {
      errors.push(
        'Партія має заборонений статус "' +
        lot.lotStatus +
        '"'
      );
    }

    if (
      isInterbranchTransferPending_(
        lot.currentTransferStatus
      )
    ) {
      errors.push(
        'Для партії вже є незавершене переміщення зі статусом "' +
        lot.currentTransferStatus +
        '"'
      );
    }

    if (
      lot.expiryDate &&
      operationDate &&
      lot.expiryDate.getTime() <
        operationDate.getTime()
    ) {
      errors.push(
        'Термін придатності партії минув'
      );
    }

    if (
      lot.receiptDate &&
      operationDate &&
      lot.receiptDate.getTime() >
        operationDate.getTime()
    ) {
      errors.push(
        'Дата надходження партії пізніша за дату переміщення'
      );
    }

    if (
      lot.unitCost <= 0
    ) {
      errors.push(
        'У партії не визначено коректну собівартість одиниці'
      );
    }

    const balanceAfter =
      lot.currentBalance -
      quantity;

    if (
      balanceAfter >
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .tolerance &&
      lot.minimumStock > 0 &&
      balanceAfter <=
        lot.minimumStock
    ) {
      warnings.push(
        'Після переміщення залишок партії буде не більшим за встановлений поріг: ' +
        lot.minimumStock
      );
    }

    if (
      balanceAfter <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance
    ) {
      warnings.push(
        'Після переміщення партія буде повністю закрита'
      );
    }
  }

  return {
    ok:
      errors.length === 0,

    errors:
      errors,

    warnings:
      warnings
  };
}


/****************************************************
 * СУХИЙ ПЛАН ПЕРЕМІЩЕННЯ
 *
 * request:
 * {
 *   sourceRow: 5,
 *   destinationBranch: 'Бабурка',
 *   quantity: 2,
 *   operationDate: new Date()
 * }
 *
 * Нічого не записує.
 *
 * @param {Object} request
 * @return {Object}
 ****************************************************/

function planInterbranchTransfer_(
  request
) {
  assertInterbranchPlannerDependencies_();

  if (!request) {
    throw new Error(
      'Не передано параметри переміщення'
    );
  }

  const activeSpreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const activeSpreadsheetId =
    activeSpreadsheet.getId();

  const sourceBranch =
    getCurrentInterbranchBranch_(
      activeSpreadsheetId
    );

  if (!sourceBranch) {
    throw new Error(
      'Поточна таблиця не знайдена в конфігурації філій'
    );
  }

  const destinationBranchName =
    String(
      request.destinationBranch || ''
    ).trim();

  if (!destinationBranchName) {
    throw new Error(
      'Не визначено філію-одержувача'
    );
  }

  const destinationConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[
        destinationBranchName
      ];

  if (!destinationConfig) {
    throw new Error(
      'Філія "' +
      destinationBranchName +
      '" відсутня в конфігурації'
    );
  }

  const destinationBranch = {
    name:
      destinationBranchName,

    code:
      destinationConfig.code,

    spreadsheetId:
      destinationConfig.spreadsheetId
  };

  const stockSheet =
    activeSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock
      );

  if (!stockSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock +
      '"'
    );
  }

  const sourceRow =
    Number(
      request.sourceRow
    ) || 0;

  const lot =
    getInterbranchTransferSourceLot_(
      stockSheet,
      sourceRow
    );

  const quantity =
    interbranchPlannerNumber_(
      request.quantity
    );

  const operationDate =
    interbranchPlannerDateOnly_(
      request.operationDate
    ) ||
    interbranchPlannerDateOnly_(
      new Date()
    );

  const validation =
    validateInterbranchTransferPlan_({
      lot:
        lot,

      sourceBranch:
        sourceBranch,

      destinationBranch:
        destinationBranch,

      quantity:
        quantity,

      operationDate:
        operationDate
    });

  if (!validation.ok) {
    throw new Error(
      'Переміщення неможливе:\n\n' +
      validation.errors.join(
        '\n'
      )
    );
  }

  /*
   * Перевіряємо, що файл одержувача
   * справді відкривається.
   */
  const destinationSpreadsheet =
    SpreadsheetApp.openById(
      destinationBranch
        .spreadsheetId
    );

  const destinationStockCheck =
    checkInterbranchSheetStructure_(
      destinationSpreadsheet,
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock,
      INTERBRANCH_TRANSFER_CONFIG
        .stockHeaders
    );

  if (!destinationStockCheck.ok) {
    throw new Error(
      'Склад філії-одержувача не готовий:\n\n' +
      destinationStockCheck
        .errors
        .join('\n')
    );
  }

  const transferId =
    buildInterbranchTransferId_(
      sourceBranch,
      destinationBranch
    );

  const receiverLotId =
    transferId +
    '-LOT-IN';

  const sourceBalanceAfter =
    interbranchPlannerNumber_(
      lot.currentBalance -
      quantity
    );

  const totalCost =
    interbranchPlannerRoundMoney_(
      quantity *
      lot.unitCost
    );

  return {
    ok:
      true,

    requiresWrite:
      false,

    transferId:
      transferId,

    receiverLotId:
      receiverLotId,

    operationDate:
      operationDate,

    sourceBranch:
      sourceBranch.name,

    sourceBranchCode:
      sourceBranch.code,

    sourceSpreadsheetId:
      sourceBranch.spreadsheetId,

    destinationBranch:
      destinationBranch.name,

    destinationBranchCode:
      destinationBranch.code,

    destinationSpreadsheetId:
      destinationBranch.spreadsheetId,

    sourceSheetName:
      stockSheet.getName(),

    sourceRow:
      sourceRow,

    sourceLotId:
      lot.lotId,

    sourceReceiptOperationId:
      lot.receiptOperationId,

    inventoryType:
      lot.inventoryType,

    inventoryName:
      lot.inventoryName,

    series:
      lot.series,

    expiryDate:
      lot.expiryDate,

    receiptDate:
      lot.receiptDate,

    supplier:
      lot.supplier,

    quantity:
      quantity,

    sourceBalanceBefore:
      lot.currentBalance,

    sourceBalanceAfter:
      sourceBalanceAfter,

    unitCost:
      lot.unitCost,

    totalCost:
      totalCost,

    minimumStock:
      lot.minimumStock,

    currentLotStatus:
      lot.lotStatus,

    transferredToBranchesBefore:
      lot.transferredToBranches,

    transferredToBranchesAfter:
      interbranchPlannerNumber_(
        lot.transferredToBranches +
        quantity
      ),

    plannedSourceTransferStatus:
      'Передано — очікує приймання',

    plannedReceiverLotStatus:
      'Заблокована',

    plannedReceiverTransferStatus:
      'Очікує приймання',

    plannedReceiverAcceptedQuantity:
      0,

    plannedReceiverCurrentBalance:
      0,

    warnings:
      validation.warnings,

    noCellsWritten:
      true
  };
}


/****************************************************
 * ПОШУК ПЕРШОЇ ДОСТУПНОЇ ПАРТІЇ ДЛЯ ТЕСТУ
 *
 * Нічого не записує.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {number}
 ****************************************************/

function findFirstInterbranchTransferTestRow_(
  sheet
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const today =
    interbranchPlannerDateOnly_(
      new Date()
    );

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    const row =
      values[index];

    const lotId =
      String(
        row[
          columns.lotId
        ] || ''
      ).trim();

    const inventoryType =
      String(
        row[
          columns.inventoryType
        ] || ''
      ).trim();

    const inventoryName =
      String(
        row[
          columns.inventoryName
        ] || ''
      ).trim();

    const currentBalance =
      interbranchPlannerNumber_(
        row[
          columns.currentBalance
        ]
      );

    const unitCost =
      interbranchPlannerNumber_(
        row[
          columns.unitCost
        ]
      );

    const lotStatus =
      String(
        row[
          columns.lotStatus
        ] || ''
      ).trim();

    const transferStatus =
      String(
        row[
          columns.transferStatus
        ] || ''
      ).trim();

    const expiryDate =
      interbranchPlannerDateOnly_(
        row[
          columns.expiryDate
        ]
      );

    const receiptDate =
      interbranchPlannerDateOnly_(
        row[
          columns.receiptDate
        ]
      );

    const notExpired =
      !expiryDate ||
      !today ||
      expiryDate.getTime() >=
        today.getTime();

    const alreadyReceived =
      !receiptDate ||
      !today ||
      receiptDate.getTime() <=
        today.getTime();

    if (
      lotId &&
      inventoryType &&
      inventoryName &&
      currentBalance >= 1 &&
      unitCost > 0 &&
      !isInterbranchLotStatusBlocked_(
        lotStatus
      ) &&
      !isInterbranchTransferPending_(
        transferStatus
      ) &&
      notExpired &&
      alreadyReceived
    ) {
      return index + 2;
    }
  }

  return 0;
}


/****************************************************
 * СУХИЙ ТЕСТ ПЛАНУВАННЯ
 *
 * Автоматично:
 * — визначає поточну філію;
 * — знаходить першу доступну партію;
 * — планує передачу 1 одиниці;
 * — перевіряє відсутність змін.
 ****************************************************/

function testInterbranchTransferPlanningDryRun() {
  assertInterbranchPlannerDependencies_();

  const activeSpreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const activeSpreadsheetId =
    activeSpreadsheet.getId();

  const sourceBranch =
    getCurrentInterbranchBranch_(
      activeSpreadsheetId
    );

  if (!sourceBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації філій'
    );
  }

  const destinationBranch =
    getRemoteInterbranchBranch_(
      sourceBranch.name
    );

  if (!destinationBranch) {
    throw new Error(
      'Не вдалося визначити філію-одержувача'
    );
  }

  const stockSheet =
    activeSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock
      );

  const movementSheet =
    activeSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .movement
      );

  const journalSheet =
    activeSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .transferJournal
      );

  if (
    !stockSheet ||
    !movementSheet ||
    !journalSheet
  ) {
    throw new Error(
      'У поточній таблиці відсутній один із робочих листів'
    );
  }

  const sourceRow =
    findFirstInterbranchTransferTestRow_(
      stockSheet
    );

  if (!sourceRow) {
    throw new Error(
      'Не знайдено доступної партії для сухого тесту переміщення'
    );
  }

  const destinationSpreadsheet =
    SpreadsheetApp.openById(
      destinationBranch
        .spreadsheetId
    );

  const remoteStockSheet =
    destinationSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock
      );

  const remoteMovementSheet =
    destinationSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .movement
      );

  const remoteJournalSheet =
    destinationSpreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .transferJournal
      );

  if (
    !remoteStockSheet ||
    !remoteMovementSheet ||
    !remoteJournalSheet
  ) {
    throw new Error(
      'У таблиці одержувача відсутній один із робочих листів'
    );
  }

  const sourceRowBefore =
    stockSheet
      .getRange(
        sourceRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const beforeState = {
    sourceStockLastRow:
      stockSheet.getLastRow(),

    sourceMovementLastRow:
      movementSheet.getLastRow(),

    sourceJournalLastRow:
      journalSheet.getLastRow(),

    remoteStockLastRow:
      remoteStockSheet.getLastRow(),

    remoteMovementLastRow:
      remoteMovementSheet.getLastRow(),

    remoteJournalLastRow:
      remoteJournalSheet.getLastRow(),

    sourceRowSnapshot:
      JSON.stringify(
        sourceRowBefore
      )
  };

  const plan =
    planInterbranchTransfer_({
      sourceRow:
        sourceRow,

      destinationBranch:
        destinationBranch.name,

      quantity:
        1,

      operationDate:
        new Date()
    });

  SpreadsheetApp.flush();

  const sourceRowAfter =
    stockSheet
      .getRange(
        sourceRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const afterState = {
    sourceStockLastRow:
      stockSheet.getLastRow(),

    sourceMovementLastRow:
      movementSheet.getLastRow(),

    sourceJournalLastRow:
      journalSheet.getLastRow(),

    remoteStockLastRow:
      remoteStockSheet.getLastRow(),

    remoteMovementLastRow:
      remoteMovementSheet.getLastRow(),

    remoteJournalLastRow:
      remoteJournalSheet.getLastRow(),

    sourceRowSnapshot:
      JSON.stringify(
        sourceRowAfter
      )
  };

  const noCellsWritten =
    JSON.stringify(
      beforeState
    ) ===
    JSON.stringify(
      afterState
    );

  const checks = {
    planOk:
      plan.ok === true,

    noWriteRequired:
      plan.requiresWrite === false,

    sourceBranchCorrect:
      plan.sourceBranch ===
      sourceBranch.name,

    destinationBranchCorrect:
      plan.destinationBranch ===
      destinationBranch.name,

    sourceLotSelected:
      Boolean(
        plan.sourceLotId
      ),

    quantityCorrect:
      Math.abs(
        plan.quantity - 1
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    balanceCalculated:
      Math.abs(
        plan.sourceBalanceAfter -
        (
          plan.sourceBalanceBefore -
          plan.quantity
        )
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    costCalculated:
      Math.abs(
        plan.totalCost -
        interbranchPlannerRoundMoney_(
          plan.quantity *
          plan.unitCost
        )
      ) <= 0.01,

    transferIdCreated:
      Boolean(
        plan.transferId
      ),

    receiverLotIdCreated:
      Boolean(
        plan.receiverLotId
      ),

    receiverBlockedBeforeAcceptance:
      plan.plannedReceiverLotStatus ===
      'Заблокована',

    receiverBalanceZero:
      plan.plannedReceiverCurrentBalance ===
      0,

    noCellsWritten:
      noCellsWritten === true
  };

  const ok =
    Object.keys(
      checks
    ).every(
      function(key) {
        return (
          checks[key] ===
          true
        );
      }
    );

  const result = {
    ok:
      ok,

    test:
      'testInterbranchTransferPlanningDryRun',

    version:
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .version,

    sourceBranch:
      sourceBranch.name,

    destinationBranch:
      destinationBranch.name,

    sourceRow:
      sourceRow,

    plan:
      plan,

    checks:
      checks,

    beforeState:
      beforeState,

    afterState:
      afterState,

    noCellsWritten:
      noCellsWritten
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      ok
        ? (
            'Сухий план переміщення сформовано: ' +
            plan.inventoryName +
            ', 1 од. ' +
            sourceBranch.name +
            ' → ' +
            destinationBranch.name
          )
        : (
            'Сухий тест планування не пройдено. ' +
            'Перевірте журнал виконання.'
          ),
      'Переміщення між філіями',
      10
    );

  if (!ok) {
    throw new Error(
      'Сухий тест планування переміщення не пройдено'
    );
  }

  return result;
}