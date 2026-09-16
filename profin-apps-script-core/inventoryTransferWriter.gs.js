/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПЕРЕМІЩЕННЯ
 * КРОК 4А. КОНТРОЛЬОВАНИЙ ЗАПИС І ВІДКАТ
 *
 * ЗАЛЕЖНОСТІ:
 * — inventoryTransferConfig.gs
 * — inventoryTransferPlanner.gs
 * — inventoryTransferUi.gs
 *
 * На поточному етапі запускаємо тільки:
 * testInterbranchTransferWriteRollback()
 ****************************************************/


const INTERBRANCH_TRANSFER_WRITE_CONFIG =
  Object.freeze({

    version:
      '1.0',

    lockTimeoutMs:
      30000,

    directorySheet:
      'Довідник',

    minimumStockRange:
      'F39:G41',

    receiverPendingBackground:
      '#f4cccc',

    statuses:
      Object.freeze({
        sourcePending:
          'Передано — очікує приймання',

        receiverPending:
          'Очікує приймання',

        accepted:
          'Прийнято',

        returned:
          'Повернуто'
      }),

    movementTypes:
      Object.freeze({
        sourceTransfer:
          'Передача у філію',

        receiverPending:
          'Очікування приймання'
      }),

    lotStatuses:
      Object.freeze({
        active:
          'Активна',

        lowStock:
          'Низький залишок',

        closed:
          'Закрита',

        blocked:
          'Заблокована'
      })
  });


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assertInterbranchWriteDependencies_() {
  if (
    typeof INTERBRANCH_TRANSFER_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_CONFIG.'
    );
  }

  if (
    typeof INTERBRANCH_TRANSFER_PLANNER_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_PLANNER_CONFIG.'
    );
  }

  if (
    typeof INTERBRANCH_TRANSFER_UI_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_UI_CONFIG.'
    );
  }

  if (
    typeof planInterbranchTransfer_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено planInterbranchTransfer_().'
    );
  }

  if (
    typeof getActiveInterbranchStockContext_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено getActiveInterbranchStockContext_().'
    );
  }

  if (
    typeof interbranchPlannerNumber_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено interbranchPlannerNumber_().'
    );
  }

  if (
    typeof interbranchPlannerRoundMoney_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено interbranchPlannerRoundMoney_().'
    );
  }

  return true;
}


/****************************************************
 * КОРИСТУВАЧ ОПЕРАЦІЇ
 ****************************************************/

function getInterbranchWriteUser_() {
  let email = '';

  try {
    email =
      Session
        .getActiveUser()
        .getEmail();
  } catch (error) {
    email = '';
  }

  if (!email) {
    try {
      email =
        Session
          .getEffectiveUser()
          .getEmail();
    } catch (error) {
      email = '';
    }
  }

  return email ||
    'Невідомий користувач';
}


/****************************************************
 * СТАТУС ВИХІДНОЇ ПАРТІЇ ПІСЛЯ ПЕРЕДАЧІ
 ****************************************************/

function resolveInterbranchSourceLotStatus_(
  balance,
  minimumStock
) {
  const quantity =
    interbranchPlannerNumber_(
      balance
    );

  const minimum =
    interbranchPlannerNumber_(
      minimumStock
    );

  const tolerance =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance;

  if (
    quantity <=
    tolerance
  ) {
    return INTERBRANCH_TRANSFER_WRITE_CONFIG
      .lotStatuses
      .closed;
  }

  if (
    minimum > 0 &&
    quantity <= minimum
  ) {
    return INTERBRANCH_TRANSFER_WRITE_CONFIG
      .lotStatuses
      .lowStock;
  }

  return INTERBRANCH_TRANSFER_WRITE_CONFIG
    .lotStatuses
    .active;
}


/****************************************************
 * МІНІМАЛЬНИЙ ЗАЛИШОК У ФІЛІЇ-ОДЕРЖУВАЧІ
 ****************************************************/

function getInterbranchDestinationMinimumStock_(
  spreadsheet,
  inventoryType,
  fallbackValue
) {
  const sheet =
    spreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_WRITE_CONFIG
          .directorySheet
      );

  if (!sheet) {
    return interbranchPlannerNumber_(
      fallbackValue
    );
  }

  const values =
    sheet
      .getRange(
        INTERBRANCH_TRANSFER_WRITE_CONFIG
          .minimumStockRange
      )
      .getValues();

  const expectedType =
    interbranchPlannerNormalize_(
      inventoryType
    );

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    const rowType =
      interbranchPlannerNormalize_(
        values[index][0]
      );

    if (
      rowType ===
      expectedType
    ) {
      return interbranchPlannerNumber_(
        values[index][1]
      );
    }
  }

  return interbranchPlannerNumber_(
    fallbackValue
  );
}


/****************************************************
 * ДОДАВАННЯ РЯДКА
 ****************************************************/

function appendInterbranchWriteRow_(
  sheet,
  values
) {
  const row =
    Math.max(
      sheet.getLastRow() + 1,
      2
    );

  sheet
    .getRange(
      row,
      1,
      1,
      values.length
    )
    .setValues([
      values
    ]);

  return row;
}
/****************************************************
 * СТАНДАРТНІ ФОРМАТИ РЯДКА СКЛАДУ
 *
 * Змінює тільки числові формати.
 * Значення, формули, фони та дропдауни не змінює.
 ****************************************************/

function formatInterbranchStockRow_(
  sheet,
  row
) {
  if (
    !sheet ||
    Number(row) < 2
  ) {
    return;
  }

  const targetRow =
    Number(row);

  /*
   * F:G — термін придатності,
   * дата надходження.
   */
  sheet
    .getRange(
      targetRow,
      6,
      1,
      2
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  /*
   * I — прийнято.
   */
  sheet
    .getRange(
      targetRow,
      9
    )
    .setNumberFormat(
      '#,##0'
    );

  /*
   * J:K — собівартість одиниці
   * та загальна закупівельна вартість.
   *
   * Без дописування «грн.» у клітинці.
   */
  sheet
    .getRange(
      targetRow,
      10,
      1,
      2
    )
    .setNumberFormat(
      '#,##0.00'
    );

  /*
   * L:P — кількісні показники:
   * продано, передано, списано,
   * залишок, мінімальний залишок.
   */
  sheet
    .getRange(
      targetRow,
      12,
      1,
      5
    )
    .setNumberFormat(
      '#,##0'
    );

  /*
   * S — дата і час створення.
   */
  sheet
    .getRange(
      targetRow,
      19
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  /*
   * W — кількість переміщення.
   */
  sheet
    .getRange(
      targetRow,
      23
    )
    .setNumberFormat(
      '#,##0'
    );

  /*
   * Z — дата і час переміщення.
   */
  sheet
    .getRange(
      targetRow,
      26
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  /*
   * AB — передано у філії.
   */
  sheet
    .getRange(
      targetRow,
      28
    )
    .setNumberFormat(
      '#,##0'
    );
}

/****************************************************
 * ПОШУК ТОЧНОГО ЗНАЧЕННЯ В КОЛОНЦІ
 ****************************************************/

function interbranchColumnContainsValue_(
  sheet,
  column,
  expectedValue
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const found =
    sheet
      .getRange(
        2,
        column,
        lastRow - 1,
        1
      )
      .createTextFinder(
        String(
          expectedValue || ''
        )
      )
      .matchEntireCell(
        true
      )
      .findNext();

  return Boolean(
    found
  );
}


/****************************************************
 * ЗАХИСТ ВІД ДУБЛІВ
 ****************************************************/

function assertInterbranchTransferIsUnique_(
  sourceJournalSheet,
  destinationStockSheet,
  destinationJournalSheet,
  plan
) {
  if (
    interbranchColumnContainsValue_(
      sourceJournalSheet,
      1,
      plan.transferId
    )
  ) {
    throw new Error(
      'ID переміщення вже існує у журналі відправника: ' +
      plan.transferId
    );
  }

  if (
    interbranchColumnContainsValue_(
      destinationJournalSheet,
      1,
      plan.transferId
    )
  ) {
    throw new Error(
      'ID переміщення вже існує у журналі одержувача: ' +
      plan.transferId
    );
  }

  if (
    interbranchColumnContainsValue_(
      destinationStockSheet,
      1,
      plan.receiverLotId
    )
  ) {
    throw new Error(
      'Партія одержувача вже існує: ' +
      plan.receiverLotId
    );
  }

  return true;
}


/****************************************************
 * РЯДОК СКЛАДУ ВІДПРАВНИКА ПІСЛЯ ПЕРЕДАЧІ
 ****************************************************/

function buildInterbranchSourceStockRow_(
  lot,
  plan,
  user,
  createdAt
) {
  const values =
    lot.rawValues.slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  values[
    columns.currentBalance
  ] =
    plan.sourceBalanceAfter;

  values[
    columns.lotStatus
  ] =
    resolveInterbranchSourceLotStatus_(
      plan.sourceBalanceAfter,
      plan.minimumStock
    );

  values[
    columns.transferId
  ] =
    plan.transferId;

  values[
    columns.sourceBranch
  ] =
    plan.sourceBranch;

  values[
    columns.destinationBranch
  ] =
    plan.destinationBranch;

  values[
    columns.transferQuantity
  ] =
    plan.quantity;

  values[
    columns.transferStatus
  ] =
    INTERBRANCH_TRANSFER_WRITE_CONFIG
      .statuses
      .sourcePending;

  values[
    columns.transferAction
  ] =
    '';

  values[
    columns.transferDateTime
  ] =
    createdAt;

  values[
    columns.transferUser
  ] =
    user;

  values[
    columns.transferredToBranches
  ] =
    plan.transferredToBranchesAfter;

  return values;
}


/****************************************************
 * РЯДОК СКЛАДУ ОДЕРЖУВАЧА
 ****************************************************/

function buildInterbranchReceiverStockRow_(
  plan,
  minimumStock,
  user,
  createdAt
) {
  return [
    plan.receiverLotId,               // A
    plan.transferId,                  // B
    plan.inventoryType,               // C
    plan.inventoryName,               // D
    plan.series,                      // E
    plan.expiryDate || '',            // F
    plan.receiptDate || '',           // G
    plan.supplier || '',              // H
    0,                                // I Прийнято
    plan.unitCost,                    // J
    0,                                // K
    0,                                // L
    0,                                // M
    0,                                // N
    0,                                // O Поточний залишок
    minimumStock,                     // P
    INTERBRANCH_TRANSFER_WRITE_CONFIG
      .lotStatuses
      .blocked,                       // Q
    user,                             // R
    createdAt,                        // S
    plan.transferId,                  // T
    plan.sourceBranch,                // U
    plan.destinationBranch,           // V
    plan.quantity,                    // W
    INTERBRANCH_TRANSFER_WRITE_CONFIG
      .statuses
      .receiverPending,               // X
    '',                               // Y
    createdAt,                        // Z
    user,                             // AA
    0                                 // AB
  ];
}


/****************************************************
 * РЯДОК РУХУ СКЛАДУ
 ****************************************************/

function buildInterbranchMovementRow_(
  movementId,
  plan,
  lotId,
  movementType,
  user,
  createdAt
) {
  return [
    movementId,
    plan.transferId,
    plan.operationDate,
    plan.inventoryType,
    plan.inventoryName,
    lotId,
    movementType,
    plan.quantity,
    plan.unitCost,
    plan.totalCost,
    user,
    createdAt
  ];
}


/****************************************************
 * РЯДОК ЖУРНАЛУ ПЕРЕМІЩЕНЬ
 ****************************************************/

function buildInterbranchTransferJournalRow_(
  plan,
  user,
  createdAt
) {
  return [
    plan.transferId,
    createdAt,
    plan.sourceBranch,
    plan.destinationBranch,
    plan.sourceLotId,
    plan.receiverLotId,
    plan.inventoryType,
    plan.inventoryName,
    plan.series,
    plan.expiryDate || '',
    plan.quantity,
    plan.unitCost,
    plan.totalCost,
    INTERBRANCH_TRANSFER_WRITE_CONFIG
      .statuses
      .receiverPending,
    user,
    createdAt,
    '',
    '',
    '',
    ''
  ];
}


/****************************************************
 * ДРОПДАУН ПРИЙНЯТИ / ПОВЕРНУТИ
 ****************************************************/

function setInterbranchReceiverActionValidation_(
  cell
) {
  const rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          INTERBRANCH_TRANSFER_UI_CONFIG
            .actions
            .accept,

          INTERBRANCH_TRANSFER_UI_CONFIG
            .actions
            .returnToSender
        ],
        true
      )
      .setAllowInvalid(
        false
      )
      .setHelpText(
        'Оберіть: Прийняти або Повернути.'
      )
      .build();

  cell
    .clearContent()
    .setDataValidation(
      rule
    );
}


/****************************************************
 * КОНТРОЛЬОВАНЕ ВИДАЛЕННЯ ДОДАНОГО РЯДКА
 ****************************************************/

function deleteInterbranchRowIfMatches_(
  sheet,
  row,
  keyColumn,
  expectedValue
) {
  if (
    !sheet ||
    !row ||
    row < 2 ||
    row > sheet.getLastRow()
  ) {
    return false;
  }

  const actualValue =
    String(
      sheet
        .getRange(
          row,
          keyColumn
        )
        .getValue() || ''
    ).trim();

  if (
    actualValue !==
    String(
      expectedValue || ''
    ).trim()
  ) {
    throw new Error(
      'Відкат зупинено: у рядку ' +
      row +
      ' листа "' +
      sheet.getName() +
      '" знайдено інший ключ "' +
      actualValue +
      '".'
    );
  }

  sheet.deleteRow(
    row
  );

  return true;
}


/****************************************************
 * ПРИМУСОВА ПОМИЛКА ДЛЯ ТЕСТУ
 ****************************************************/

function maybeForceInterbranchWriteFailure_(
  point,
  options
) {
  if (
    options &&
    options.forceFailureAt ===
    point
  ) {
    throw new Error(
      'ТЕСТОВА ПОМИЛКА: ' +
      point
    );
  }
}


/****************************************************
 * ВІДКАТ ОПЕРАЦІЇ
 ****************************************************/

function rollbackInterbranchTransfer_(
  transaction
) {
  const rollbackErrors =
    [];

  function safeRollback(
    callback
  ) {
    try {
      callback();
    } catch (error) {
      rollbackErrors.push(
        String(
          error &&
          error.message
            ? error.message
            : error
        )
      );
    }
  }

  /*
   * Спочатку видаляємо додані записи
   * у зворотному порядку.
   */

  if (
    transaction.rows
      .sourceJournal
  ) {
    safeRollback(
      function() {
        deleteInterbranchRowIfMatches_(
          transaction.sheets
            .sourceJournal,
          transaction.rows
            .sourceJournal,
          1,
          transaction.plan
            .transferId
        );
      }
    );
  }

  if (
    transaction.rows
      .sourceMovement
  ) {
    safeRollback(
      function() {
        deleteInterbranchRowIfMatches_(
          transaction.sheets
            .sourceMovement,
          transaction.rows
            .sourceMovement,
          1,
          transaction.ids
            .sourceMovementId
        );
      }
    );
  }

  if (
    transaction.rows
      .destinationJournal
  ) {
    safeRollback(
      function() {
        deleteInterbranchRowIfMatches_(
          transaction.sheets
            .destinationJournal,
          transaction.rows
            .destinationJournal,
          1,
          transaction.plan
            .transferId
        );
      }
    );
  }

  if (
    transaction.rows
      .destinationMovement
  ) {
    safeRollback(
      function() {
        deleteInterbranchRowIfMatches_(
          transaction.sheets
            .destinationMovement,
          transaction.rows
            .destinationMovement,
          1,
          transaction.ids
            .destinationMovementId
        );
      }
    );
  }

  if (
    transaction.rows
      .destinationStock
  ) {
    safeRollback(
      function() {
        deleteInterbranchRowIfMatches_(
          transaction.sheets
            .destinationStock,
          transaction.rows
            .destinationStock,
          1,
          transaction.plan
            .receiverLotId
        );
      }
    );
  }

  /*
   * Відновлюємо вихідну партію.
   */

  if (
    transaction.sourceRowChanged
  ) {
    safeRollback(
      function() {
        transaction
          .sheets
          .sourceStock
          .getRange(
            transaction.plan
              .sourceRow,
            1,
            1,
            INTERBRANCH_TRANSFER_PLANNER_CONFIG
              .stockColumnCount
          )
          .setValues([
            transaction
              .sourceSnapshot
              .values
          ]);

        transaction
          .sheets
          .sourceStock
          .getRange(
            transaction.plan
              .sourceRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .setDataValidation(
            transaction
              .sourceSnapshot
              .actionValidation
          );
      }
    );
  }

  SpreadsheetApp.flush();

  return {
    ok:
      rollbackErrors.length === 0,

    errors:
      rollbackErrors
  };
}


/****************************************************
 * ПЕРЕВІРКА ФАКТИЧНОГО ЗАПИСУ
 ****************************************************/

function verifyInterbranchTransferWrite_(
  transaction
) {
  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const sourceValues =
    transaction
      .sheets
      .sourceStock
      .getRange(
        transaction.plan.sourceRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const receiverValues =
    transaction
      .sheets
      .destinationStock
      .getRange(
        transaction.rows.destinationStock,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const checks = {
    sourceTransferId:
      String(
        sourceValues[
          columns.transferId
        ] || ''
      ) ===
      transaction.plan.transferId,

    sourceBalance:
      Math.abs(
        interbranchPlannerNumber_(
          sourceValues[
            columns.currentBalance
          ]
        ) -
        transaction.plan.sourceBalanceAfter
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    sourceTransferredTotal:
      Math.abs(
        interbranchPlannerNumber_(
          sourceValues[
            columns.transferredToBranches
          ]
        ) -
        transaction.plan
          .transferredToBranchesAfter
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverLotId:
      String(
        receiverValues[
          columns.lotId
        ] || ''
      ) ===
      transaction.plan.receiverLotId,

    receiverBalanceZero:
      interbranchPlannerNumber_(
        receiverValues[
          columns.currentBalance
        ]
      ) === 0,

    receiverBlocked:
      String(
        receiverValues[
          columns.lotStatus
        ] || ''
      ) ===
      INTERBRANCH_TRANSFER_WRITE_CONFIG
        .lotStatuses
        .blocked,

    receiverPending:
      String(
        receiverValues[
          columns.transferStatus
        ] || ''
      ) ===
      INTERBRANCH_TRANSFER_WRITE_CONFIG
        .statuses
        .receiverPending
  };

  const ok =
    Object
      .keys(
        checks
      )
      .every(
        function(key) {
          return checks[key] ===
            true;
        }
      );

  return {
    ok:
      ok,

    checks:
      checks
  };
}


/****************************************************
 * ОСНОВНА ФУНКЦІЯ ЗАПИСУ
 *
 * options.forceFailureAt використовується
 * лише для тесту контрольованого відкату.
 ****************************************************/

function executeInterbranchTransferCore_(
  request,
  options
) {
  assertInterbranchWriteDependencies_();

  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    INTERBRANCH_TRANSFER_WRITE_CONFIG
      .lockTimeoutMs
  );

  const transaction = {
    plan:
      null,

    sheets:
      {},

    rows: {
      destinationStock:
        0,

      destinationMovement:
        0,

      destinationJournal:
        0,

      sourceMovement:
        0,

      sourceJournal:
        0
    },

    ids: {
      sourceMovementId:
        '',

      destinationMovementId:
        ''
    },

    sourceSnapshot:
      null,

    sourceRowChanged:
      false
  };

  try {
    const sourceSpreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const plan =
      planInterbranchTransfer_(
        request
      );

    transaction.plan =
      plan;

    const destinationSpreadsheet =
      SpreadsheetApp.openById(
        plan.destinationSpreadsheetId
      );

    const sourceStockSheet =
      sourceSpreadsheet.getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock
      );

    const sourceMovementSheet =
      sourceSpreadsheet.getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .movement
      );

    const sourceJournalSheet =
      sourceSpreadsheet.getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .transferJournal
      );

    const destinationStockSheet =
      destinationSpreadsheet.getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock
      );

    const destinationMovementSheet =
      destinationSpreadsheet.getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .movement
      );

    const destinationJournalSheet =
      destinationSpreadsheet.getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .transferJournal
      );

    if (
      !sourceStockSheet ||
      !sourceMovementSheet ||
      !sourceJournalSheet ||
      !destinationStockSheet ||
      !destinationMovementSheet ||
      !destinationJournalSheet
    ) {
      throw new Error(
        'Не знайдено один із робочих листів.'
      );
    }

    transaction.sheets = {
      sourceStock:
        sourceStockSheet,

      sourceMovement:
        sourceMovementSheet,

      sourceJournal:
        sourceJournalSheet,

      destinationStock:
        destinationStockSheet,

      destinationMovement:
        destinationMovementSheet,

      destinationJournal:
        destinationJournalSheet
    };

    const sourceLot =
      getInterbranchTransferSourceLot_(
        sourceStockSheet,
        plan.sourceRow
      );

    /*
     * Повторна перевірка після отримання блокування.
     */

    if (
      sourceLot.lotId !==
      plan.sourceLotId
    ) {
      throw new Error(
        'Вибрана партія змінилася під час операції.'
      );
    }

    if (
      Math.abs(
        sourceLot.currentBalance -
        plan.sourceBalanceBefore
      ) >
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance
    ) {
      throw new Error(
        'Залишок партії змінився під час операції. ' +
        'Оновіть план.'
      );
    }

    assertInterbranchTransferIsUnique_(
      sourceJournalSheet,
      destinationStockSheet,
      destinationJournalSheet,
      plan
    );

    transaction.sourceSnapshot = {
      values:
        sourceStockSheet
          .getRange(
            plan.sourceRow,
            1,
            1,
            INTERBRANCH_TRANSFER_PLANNER_CONFIG
              .stockColumnCount
          )
          .getValues()[0],

      actionValidation:
        sourceStockSheet
          .getRange(
            plan.sourceRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .getDataValidation()
    };

    const user =
      getInterbranchWriteUser_();

    const createdAt =
      new Date();

    const minimumStock =
      getInterbranchDestinationMinimumStock_(
        destinationSpreadsheet,
        plan.inventoryType,
        plan.minimumStock
      );

    const sourceMovementId =
      plan.transferId +
      '-MOV-OUT';

    const destinationMovementId =
      plan.transferId +
      '-MOV-IN-PENDING';

    transaction.ids
      .sourceMovementId =
      sourceMovementId;

    transaction.ids
      .destinationMovementId =
      destinationMovementId;

    /****************************************************
     * ФАЗА 1. СТВОРЕННЯ ОЧІКУВАННЯ В ОДЕРЖУВАЧА
     ****************************************************/

    transaction.rows.destinationStock =
      appendInterbranchWriteRow_(
        destinationStockSheet,
        buildInterbranchReceiverStockRow_(
          plan,
          minimumStock,
          user,
          createdAt
        )
      );
      
 formatInterbranchStockRow_(
  destinationStockSheet,
  transaction.rows.destinationStock
 );
    destinationStockSheet
      .getRange(
        transaction.rows
          .destinationStock,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .setBackground(
        INTERBRANCH_TRANSFER_WRITE_CONFIG
          .receiverPendingBackground
      );

    setInterbranchReceiverActionValidation_(
      destinationStockSheet
        .getRange(
          transaction.rows
            .destinationStock,
          INTERBRANCH_TRANSFER_UI_CONFIG
            .actionColumn
        )
    );

    maybeForceInterbranchWriteFailure_(
      'afterDestinationStock',
      options
    );

    transaction.rows.destinationMovement =
      appendInterbranchWriteRow_(
        destinationMovementSheet,
        buildInterbranchMovementRow_(
          destinationMovementId,
          plan,
          plan.receiverLotId,
          INTERBRANCH_TRANSFER_WRITE_CONFIG
            .movementTypes
            .receiverPending,
          user,
          createdAt
        )
      );

    maybeForceInterbranchWriteFailure_(
      'afterDestinationMovement',
      options
    );

    transaction.rows.destinationJournal =
      appendInterbranchWriteRow_(
        destinationJournalSheet,
        buildInterbranchTransferJournalRow_(
          plan,
          user,
          createdAt
        )
      );

    maybeForceInterbranchWriteFailure_(
      'afterDestinationJournal',
      options
    );

    /****************************************************
     * ФАЗА 2. СПИСАННЯ У ВІДПРАВНИКА
     ****************************************************/

    sourceStockSheet
      .getRange(
        plan.sourceRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .setValues([
        buildInterbranchSourceStockRow_(
          sourceLot,
          plan,
          user,
          createdAt
        )
      ]);

    sourceStockSheet
      .getRange(
        plan.sourceRow,
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actionColumn
      )
      .clearDataValidations();

    transaction.sourceRowChanged =
      true;

    maybeForceInterbranchWriteFailure_(
      'afterSourceStock',
      options
    );

    transaction.rows.sourceMovement =
      appendInterbranchWriteRow_(
        sourceMovementSheet,
        buildInterbranchMovementRow_(
          sourceMovementId,
          plan,
          plan.sourceLotId,
          INTERBRANCH_TRANSFER_WRITE_CONFIG
            .movementTypes
            .sourceTransfer,
          user,
          createdAt
        )
      );

    maybeForceInterbranchWriteFailure_(
      'afterSourceMovement',
      options
    );

    transaction.rows.sourceJournal =
      appendInterbranchWriteRow_(
        sourceJournalSheet,
        buildInterbranchTransferJournalRow_(
          plan,
          user,
          createdAt
        )
      );

    SpreadsheetApp.flush();

    maybeForceInterbranchWriteFailure_(
      'afterAllWrites',
      options
    );

    const verification =
      verifyInterbranchTransferWrite_(
        transaction
      );

    if (!verification.ok) {
      throw new Error(
        'Контрольна перевірка запису не пройдена: ' +
        JSON.stringify(
          verification.checks
        )
      );
    }

    return {
      ok:
        true,

      transferId:
        plan.transferId,

      receiverLotId:
        plan.receiverLotId,

      sourceBranch:
        plan.sourceBranch,

      destinationBranch:
        plan.destinationBranch,

      inventoryType:
        plan.inventoryType,

      inventoryName:
        plan.inventoryName,

      quantity:
        plan.quantity,

      unitCost:
        plan.unitCost,

      totalCost:
        plan.totalCost,

      sourceBalanceBefore:
        plan.sourceBalanceBefore,

      sourceBalanceAfter:
        plan.sourceBalanceAfter,

      sourceRow:
        plan.sourceRow,

      destinationRow:
        transaction.rows
          .destinationStock,

      status:
        INTERBRANCH_TRANSFER_WRITE_CONFIG
          .statuses
          .receiverPending,

      verification:
        verification,

      rolledBack:
        false
    };

  } catch (error) {
    const rollback =
      rollbackInterbranchTransfer_(
        transaction
      );

    if (!rollback.ok) {
      throw new Error(
        'КРИТИЧНА ПОМИЛКА. Передачу не вдалося повністю відкотити.\n\n' +
        'Початкова помилка: ' +
        String(
          error &&
          error.message
            ? error.message
            : error
        ) +
        '\n\nПомилки відкату:\n' +
        rollback.errors.join(
          '\n'
        )
      );
    }

    throw new Error(
      'Передачу скасовано і повністю відкочено.\n\n' +
      String(
        error &&
        error.message
          ? error.message
          : error
      )
    );

  } finally {
    lock.releaseLock();
  }
}


/****************************************************
 * МАЙБУТНЯ ФУНКЦІЯ ДЛЯ HTML
 *
 * Поки її не викликаємо з діалогу.
 ****************************************************/

function executeInterbranchTransferFromDialog(
  request
) {
  if (!request) {
    throw new Error(
      'Не передано параметри міжфілійної передачі.'
    );
  }

  const sourceRow =
    Number(
      request.sourceRow ||
      request.row
    ) || 0;

  if (sourceRow < 2) {
    throw new Error(
      'Некоректний рядок складської партії.'
    );
  }

  const normalizedRequest =
    Object.assign(
      {},
      request,
      {
        sourceRow:
          sourceRow
      }
    );

  const result =
    executeInterbranchTransferCore_(
      normalizedRequest,
      {}
    );

  return JSON.parse(
    JSON.stringify(
      result
    )
  );
}


/****************************************************
 * ПІДПИС ВАЛІДАЦІЇ ДЛЯ КОНТРОЛЮ
 ****************************************************/

function getInterbranchValidationSignature_(
  range
) {
  const rule =
    range.getDataValidation();

  if (!rule) {
    return '';
  }

  const criteriaValues =
    rule.getCriteriaValues();

  let valuesText = '';

  try {
    valuesText =
      JSON.stringify(
        criteriaValues[0]
      );
  } catch (error) {
    valuesText =
      String(
        criteriaValues[0]
      );
  }

  return (
    String(
      rule.getCriteriaType()
    ) +
    '|' +
    valuesText
  );
}


/****************************************************
 * ЗНІМОК СТАНУ ДЛЯ ТЕСТУ ВІДКАТУ
 ****************************************************/

function snapshotInterbranchWriteState_(
  sourceSpreadsheet,
  destinationSpreadsheet,
  sourceRow
) {
  const sourceStock =
    sourceSpreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock
    );

  const sourceMovement =
    sourceSpreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .movement
    );

  const sourceJournal =
    sourceSpreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .transferJournal
    );

  const destinationStock =
    destinationSpreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock
    );

  const destinationMovement =
    destinationSpreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .movement
    );

  const destinationJournal =
    destinationSpreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .transferJournal
    );

  return {
    sourceStockLastRow:
      sourceStock.getLastRow(),

    sourceMovementLastRow:
      sourceMovement.getLastRow(),

    sourceJournalLastRow:
      sourceJournal.getLastRow(),

    destinationStockLastRow:
      destinationStock.getLastRow(),

    destinationMovementLastRow:
      destinationMovement.getLastRow(),

    destinationJournalLastRow:
      destinationJournal.getLastRow(),

    sourceRowValues:
      JSON.stringify(
        sourceStock
          .getRange(
            sourceRow,
            1,
            1,
            INTERBRANCH_TRANSFER_PLANNER_CONFIG
              .stockColumnCount
          )
          .getValues()[0]
      ),

    sourceActionValidation:
      getInterbranchValidationSignature_(
        sourceStock
          .getRange(
            sourceRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
      )
  };
}


/****************************************************
 * ТЕСТ ПРИМУСОВОГО ВІДКАТУ
 *
 * ПОРЯДОК:
 * 1. На листі складу виберіть партію.
 * 2. У Y оберіть «Перемістити».
 * 3. Запустіть цю функцію.
 *
 * Тест тимчасово створює записи,
 * потім навмисно викликає помилку
 * і повністю відкочує операцію.
 ****************************************************/

function testInterbranchTransferWriteRollback() {
  assertInterbranchWriteDependencies_();

  const context =
    getActiveInterbranchStockContext_();

  const action =
    String(
      context.lot
        .currentTransferAction || ''
    ).trim();

  if (
    action !==
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .transfer
  ) {
    throw new Error(
      'У колонці Y вибраного рядка оберіть «Перемістити».'
    );
  }

  const destinationBranch =
    getRemoteInterbranchBranch_(
      context.currentBranch.name
    );

  if (!destinationBranch) {
    throw new Error(
      'Не вдалося визначити філію-одержувача.'
    );
  }

  const quantity =
    Math.min(
      1,
      context.lot.currentBalance
    );

  if (
    quantity <=
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Вибрана партія не має доступного залишку.'
    );
  }

  const sourceSpreadsheet =
    context.spreadsheet;

  const destinationSpreadsheet =
    SpreadsheetApp.openById(
      destinationBranch
        .spreadsheetId
    );

  const beforeState =
    snapshotInterbranchWriteState_(
      sourceSpreadsheet,
      destinationSpreadsheet,
      context.row
    );

  let expectedFailureOccurred =
    false;

  let failureMessage =
    '';

  try {
    executeInterbranchTransferCore_(
      {
        sourceRow:
          context.row,

        destinationBranch:
          destinationBranch.name,

        quantity:
          quantity,

        operationDate:
          new Date()
      },
      {
        forceFailureAt:
          'afterAllWrites'
      }
    );

  } catch (error) {
    expectedFailureOccurred =
      true;

    failureMessage =
      String(
        error &&
        error.message
          ? error.message
          : error
      );
  }

  SpreadsheetApp.flush();

  const afterState =
    snapshotInterbranchWriteState_(
      sourceSpreadsheet,
      destinationSpreadsheet,
      context.row
    );

  const exactStateRestored =
    JSON.stringify(
      beforeState
    ) ===
    JSON.stringify(
      afterState
    );

  const checks = {
    expectedFailureOccurred:
      expectedFailureOccurred,

    sourceStockRowsRestored:
      beforeState.sourceStockLastRow ===
      afterState.sourceStockLastRow,

    sourceMovementRowsRestored:
      beforeState.sourceMovementLastRow ===
      afterState.sourceMovementLastRow,

    sourceJournalRowsRestored:
      beforeState.sourceJournalLastRow ===
      afterState.sourceJournalLastRow,

    destinationStockRowsRestored:
      beforeState.destinationStockLastRow ===
      afterState.destinationStockLastRow,

    destinationMovementRowsRestored:
      beforeState.destinationMovementLastRow ===
      afterState.destinationMovementLastRow,

    destinationJournalRowsRestored:
      beforeState.destinationJournalLastRow ===
      afterState.destinationJournalLastRow,

    sourceRowValuesRestored:
      beforeState.sourceRowValues ===
      afterState.sourceRowValues,

    sourceDropdownRestored:
      beforeState.sourceActionValidation ===
      afterState.sourceActionValidation,

    exactStateRestored:
      exactStateRestored
  };

  const ok =
    Object
      .keys(
        checks
      )
      .every(
        function(key) {
          return checks[key] ===
            true;
        }
      );

  const result = {
    ok:
      ok,

    test:
      'testInterbranchTransferWriteRollback',

    version:
      INTERBRANCH_TRANSFER_WRITE_CONFIG
        .version,

    sourceBranch:
      context.currentBranch.name,

    destinationBranch:
      destinationBranch.name,

    sourceRow:
      context.row,

    sourceLotId:
      context.lot.lotId,

    quantity:
      quantity,

    expectedFailureMessage:
      failureMessage,

    checks:
      checks,

    beforeState:
      beforeState,

    afterState:
      afterState,

    noChangesRemain:
      exactStateRestored
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
            'Контрольований відкат пройдено. ' +
            'Усі тимчасові записи видалено.'
          )
        : (
            'Тест відкату не пройдено. ' +
            'Перевірте журнал виконання.'
          ),
      'Переміщення між філіями',
      10
    );

  if (!ok) {
    throw new Error(
      'Тест контрольованого відкату не пройдено.'
    );
  }

  return result;
}
/****************************************************
 * НОРМАЛІЗАЦІЯ ФОРМАТІВ ЛИСТА «РУХ СКЛАДУ»
 *
 * C — дата операції
 * H — кількість
 * I — собівартість одиниці
 * J — загальна собівартість
 * L — дата і час створення
 *
 * Значення клітинок не змінюються.
 ****************************************************/

function repairInterbranchMovementFormats() {
  if (
    typeof INTERBRANCH_TRANSFER_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_CONFIG.'
    );
  }

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const movementSheet =
    spreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .movement
    );

  if (!movementSheet) {
    throw new Error(
      'Не знайдено лист «Рух складу».'
    );
  }

  const lastRow =
    movementSheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      sheet: movementSheet.getName(),
      rowsFormatted: 0,
      valuesChanged: false
    };
  }

  const rowCount =
    lastRow - 1;

  /*
   * C — дата руху.
   */
  movementSheet
    .getRange(
      2,
      3,
      rowCount,
      1
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  /*
   * H — кількість.
   * Цілі значення показуються як 1,
   * дробові — як 1,5 або 1,25.
   */
  movementSheet
    .getRange(
      2,
      8,
      rowCount,
      1
    )
    .setNumberFormat(
      '0.##'
    );

  /*
   * I — собівартість одиниці.
   * Без текстового суфікса «грн.».
   */
  movementSheet
    .getRange(
      2,
      9,
      rowCount,
      1
    )
    .setNumberFormat(
      '#,##0.00'
    );

  /*
   * J — загальна собівартість.
   * Без текстового суфікса «грн.».
   */
  movementSheet
    .getRange(
      2,
      10,
      rowCount,
      1
    )
    .setNumberFormat(
      '#,##0.00'
    );

  /*
   * L — дата і час створення.
   */
  movementSheet
    .getRange(
      2,
      12,
      rowCount,
      1
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    spreadsheet:
      spreadsheet.getName(),
    sheet:
      movementSheet.getName(),
    rowsFormatted:
      rowCount,
    formats: {
      C: 'dd.MM.yyyy',
      H: '0.##',
      I: '#,##0.00',
      J: '#,##0.00',
      L: 'dd.MM.yyyy HH:mm:ss'
    },
    valuesChanged:
      false
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
      'Формати листа «Рух складу» відновлено.',
      'Переміщення між філіями',
      7
    );

  return result;
}
/****************************************************
 * ОДНОРАЗОВЕ ВІДНОВЛЕННЯ ФОРМАТІВ СКЛАДУ
 *
 * Безпечно застосовує стандартні числові формати
 * до всіх наявних рядків.
 *
 * Бізнес-значення не змінює.
 ****************************************************/

function repairInterbranchStockFormats() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    spreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «Склад медичних запасів».'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok:
        true,

      formattedRows:
        0,

      businessValuesChanged:
        false
    };
  }

  const rowCount =
    lastRow - 1;

  /*
   * F:G — дати.
   */
  sheet
    .getRange(
      2,
      6,
      rowCount,
      2
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  /*
   * I — прийнято.
   */
  sheet
    .getRange(
      2,
      9,
      rowCount,
      1
    )
    .setNumberFormat(
      '#,##0'
    );

  /*
   * J:K — собівартість.
   */
  sheet
    .getRange(
      2,
      10,
      rowCount,
      2
    )
    .setNumberFormat(
      '#,##0.00'
    );

  /*
   * L:P — кількості й залишки.
   */
  sheet
    .getRange(
      2,
      12,
      rowCount,
      5
    )
    .setNumberFormat(
      '#,##0'
    );

  /*
   * S — створення партії.
   */
  sheet
    .getRange(
      2,
      19,
      rowCount,
      1
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  /*
   * W — кількість переміщення.
   */
  sheet
    .getRange(
      2,
      23,
      rowCount,
      1
    )
    .setNumberFormat(
      '#,##0'
    );

  /*
   * Z — дата і час переміщення.
   */
  sheet
    .getRange(
      2,
      26,
      rowCount,
      1
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  /*
   * AB — передано у філії.
   */
  sheet
    .getRange(
      2,
      28,
      rowCount,
      1
    )
    .setNumberFormat(
      '#,##0'
    );

  SpreadsheetApp.flush();

  const result = {
    ok:
      true,

    spreadsheet:
      spreadsheet.getName(),

    formattedRows:
      rowCount,

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

  spreadsheet.toast(
    'Формати складських рядків відновлено.',
    'Склад медичних запасів',
    7
  );

  return result;
}