/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПЕРЕМІЩЕННЯ
 * КРОК 5. ПРИЙМАННЯ, ПЕРЕВІРКА ТА ВІДКАТ
 *
 * ЗАЛЕЖНОСТІ:
 * — inventoryTransferConfig.gs
 * — inventoryTransferPlanner.gs
 * — inventoryTransferUi.gs
 * — inventoryTransferWriter.gs
 ****************************************************/
const INTERBRANCH_SETTLEMENTS_CONFIG =
  Object.freeze({
    accountingStartDate:
      '2026-07-01',

    creditorBranch:
      'Альтернатива',

    debtorBranch:
      'Бабурка',

    settlementSheetName:
      'Взаєморозрахунки філій'
  });
const INTERBRANCH_TRANSFER_RECEIVER_CONFIG = Object.freeze({
  version: '1.1',

  lockTimeoutMs: 30000,

  journalColumnCount: 20,

  statuses: Object.freeze({
    sourcePending:
      'Передано — очікує приймання',

    receiverPending:
      'Очікує приймання',

    accepted:
      'Прийнято'
  }),

  movementTypes: Object.freeze({
    accepted:
      'Прийняття з філії'
  }),

  lotStatuses: Object.freeze({
    active:
      'Активна',

    lowStock:
      'Низький залишок',

    blocked:
      'Заблокована'
  }),

  journalIndexes: Object.freeze({
    status:
      13, // N

    acceptedUser:
      16, // Q

    acceptedAt:
      17, // R

    action:
      19 // T
  })
});


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assertInterbranchReceiverDependencies_() {
  const missing = [];

  if (
    typeof INTERBRANCH_TRANSFER_CONFIG ===
    'undefined'
  ) {
    missing.push(
      'INTERBRANCH_TRANSFER_CONFIG'
    );
  }

  if (
    typeof INTERBRANCH_TRANSFER_PLANNER_CONFIG ===
    'undefined'
  ) {
    missing.push(
      'INTERBRANCH_TRANSFER_PLANNER_CONFIG'
    );
  }

  if (
    typeof INTERBRANCH_TRANSFER_UI_CONFIG ===
    'undefined'
  ) {
    missing.push(
      'INTERBRANCH_TRANSFER_UI_CONFIG'
    );
  }

  if (
    typeof getCurrentInterbranchBranch_ !==
    'function'
  ) {
    missing.push(
      'getCurrentInterbranchBranch_()'
    );
  }

  if (
    typeof getInterbranchTransferSourceLot_ !==
    'function'
  ) {
    missing.push(
      'getInterbranchTransferSourceLot_()'
    );
  }

  if (
    typeof interbranchPlannerNumber_ !==
    'function'
  ) {
    missing.push(
      'interbranchPlannerNumber_()'
    );
  }

  if (
    typeof interbranchPlannerRoundMoney_ !==
    'function'
  ) {
    missing.push(
      'interbranchPlannerRoundMoney_()'
    );
  }

  if (
    typeof interbranchPlannerNormalize_ !==
    'function'
  ) {
    missing.push(
      'interbranchPlannerNormalize_()'
    );
  }

  if (
    typeof appendInterbranchWriteRow_ !==
    'function'
  ) {
    missing.push(
      'appendInterbranchWriteRow_()'
    );
  }

  if (
    typeof deleteInterbranchRowIfMatches_ !==
    'function'
  ) {
    missing.push(
      'deleteInterbranchRowIfMatches_()'
    );
  }

  if (
    typeof getInterbranchWriteUser_ !==
    'function'
  ) {
    missing.push(
      'getInterbranchWriteUser_()'
    );
  }

  if (missing.length) {
    throw new Error(
      'Не вистачає залежностей модуля приймання:\n' +
      missing.join('\n')
    );
  }

  return true;
}


/****************************************************
 * ПОШУК ТОЧНОГО ЗНАЧЕННЯ В КОЛОНЦІ
 ****************************************************/

function findInterbranchReceiverExactRow_(
  sheet,
  column,
  expectedValue
) {
  if (!sheet) {
    return 0;
  }

  const lastRow =
    sheet.getLastRow();

  const expected =
    String(
      expectedValue || ''
    ).trim();

  if (
    lastRow < 2 ||
    !expected
  ) {
    return 0;
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
        expected
      )
      .matchEntireCell(
        true
      )
      .findNext();

  return found
    ? found.getRow()
    : 0;
}


/****************************************************
 * СТАТУС ПАРТІЇ ПІСЛЯ ПРИЙМАННЯ
 ****************************************************/

function resolveInterbranchAcceptedLotStatus_(
  quantity,
  minimumStock
) {
  const acceptedQuantity =
    interbranchPlannerNumber_(
      quantity
    );

  const minimum =
    interbranchPlannerNumber_(
      minimumStock
    );

  if (
    minimum > 0 &&
    acceptedQuantity <= minimum
  ) {
    return INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .lotStatuses
      .lowStock;
  }

  return INTERBRANCH_TRANSFER_RECEIVER_CONFIG
    .lotStatuses
    .active;
}


/****************************************************
 * ПІДПИС ПРАВИЛА ВАЛІДАЦІЇ
 *
 * Використовується для перевірки,
 * що після тестового відкату дропдаун
 * повністю відновився.
 ****************************************************/

function getInterbranchReceiverValidationSignature_(
  range
) {
  if (!range) {
    return '';
  }

  const validation =
    range.getDataValidation();

  if (!validation) {
    return '';
  }

  const criteriaValues =
    validation
      .getCriteriaValues()
      .map(
        function(value) {
          if (
            Array.isArray(
              value
            )
          ) {
            return value.map(
              function(item) {
                return String(
                  item
                );
              }
            );
          }

          return String(
            value
          );
        }
      );

  return JSON.stringify({
    criteriaType:
      String(
        validation.getCriteriaType()
      ),

    criteriaValues:
      criteriaValues,

    allowInvalid:
      validation.getAllowInvalid(),

    helpText:
      validation.getHelpText() || ''
  });
}


/****************************************************
 * ПРИМУСОВА ТЕСТОВА ПОМИЛКА
 ****************************************************/

function maybeForceInterbranchReceiverFailure_(
  point,
  options
) {
  if (
    options &&
    options.forceFailureAt === point
  ) {
    throw new Error(
      'ТЕСТОВА ПОМИЛКА ПРИЙМАННЯ: ' +
      point
    );
  }
}


/****************************************************
 * КОНТЕКСТ ВХІДНОГО ПЕРЕМІЩЕННЯ
 ****************************************************/

function getInterbranchReceiverContextByRow_(
  receiverRow
) {
  assertInterbranchReceiverDependencies_();

  const receiverSpreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const receiverBranch =
    getCurrentInterbranchBranch_(
      receiverSpreadsheet.getId()
    );

  if (!receiverBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації філій.'
    );
  }

  const sheetNames =
    INTERBRANCH_TRANSFER_CONFIG
      .sheetNames;

  const receiverStockSheet =
    receiverSpreadsheet
      .getSheetByName(
        sheetNames.stock
      );

  const receiverMovementSheet =
    receiverSpreadsheet
      .getSheetByName(
        sheetNames.movement
      );

  const receiverJournalSheet =
    receiverSpreadsheet
      .getSheetByName(
        sheetNames.transferJournal
      );

  if (
    !receiverStockSheet ||
    !receiverMovementSheet ||
    !receiverJournalSheet
  ) {
    throw new Error(
      'У таблиці одержувача відсутній один із робочих листів.'
    );
  }

  const row =
    Number(
      receiverRow
    ) || 0;

  if (
    row < 2 ||
    row >
      receiverStockSheet.getLastRow()
  ) {
    throw new Error(
      'Некоректний рядок вхідного переміщення: ' +
      row
    );
  }

  const receiverLot =
    getInterbranchTransferSourceLot_(
      receiverStockSheet,
      row
    );

  const transferId =
    String(
      receiverLot
        .currentTransferId || ''
    ).trim();

  const sourceBranchName =
    String(
      receiverLot
        .currentTransferSourceBranch || ''
    ).trim();

  const destinationBranchName =
    String(
      receiverLot
        .currentTransferDestinationBranch || ''
    ).trim();

  const quantity =
    interbranchPlannerNumber_(
      receiverLot
        .currentTransferQuantity
    );

  if (!transferId) {
    throw new Error(
      'У вибраному рядку не визначено ID переміщення.'
    );
  }

  if (!sourceBranchName) {
    throw new Error(
      'У вибраному рядку не визначено філію-відправника.'
    );
  }

  if (
    interbranchPlannerNormalize_(
      destinationBranchName
    ) !==
    interbranchPlannerNormalize_(
      receiverBranch.name
    )
  ) {
    throw new Error(
      'Поточна філія не є одержувачем цього переміщення.'
    );
  }

  if (
    interbranchPlannerNormalize_(
      receiverLot
        .currentTransferStatus
    ) !==
    interbranchPlannerNormalize_(
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .statuses
        .receiverPending
    )
  ) {
    throw new Error(
      'Переміщення не має статусу «Очікує приймання».'
    );
  }

  if (
    interbranchPlannerNormalize_(
      receiverLot.lotStatus
    ) !==
    interbranchPlannerNormalize_(
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .lotStatuses
        .blocked
    )
  ) {
    throw new Error(
      'Вхідна партія повинна мати статус «Заблокована».'
    );
  }

  if (
    quantity <=
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Не визначено кількість переміщення.'
    );
  }

  if (
    receiverLot.received >
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Партія вже має прийняту кількість.'
    );
  }

  if (
    receiverLot.currentBalance >
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Партія вже має доступний залишок.'
    );
  }

  const sourceConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[
        sourceBranchName
      ];

  if (!sourceConfig) {
    throw new Error(
      'Філія-відправник «' +
      sourceBranchName +
      '» відсутня у конфігурації.'
    );
  }

  const sourceSpreadsheet =
    SpreadsheetApp.openById(
      sourceConfig.spreadsheetId
    );

  const sourceStockSheet =
    sourceSpreadsheet
      .getSheetByName(
        sheetNames.stock
      );

  const sourceMovementSheet =
    sourceSpreadsheet
      .getSheetByName(
        sheetNames.movement
      );

  const sourceJournalSheet =
    sourceSpreadsheet
      .getSheetByName(
        sheetNames.transferJournal
      );

  if (
    !sourceStockSheet ||
    !sourceMovementSheet ||
    !sourceJournalSheet
  ) {
    throw new Error(
      'У таблиці відправника відсутній один із робочих листів.'
    );
  }

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const sourceStockRow =
    findInterbranchReceiverExactRow_(
      sourceStockSheet,
      columns.transferId + 1,
      transferId
    );

  if (!sourceStockRow) {
    throw new Error(
      'У складі відправника не знайдено переміщення ' +
      transferId
    );
  }

  const receiverJournalRow =
    findInterbranchReceiverExactRow_(
      receiverJournalSheet,
      1,
      transferId
    );

  const sourceJournalRow =
    findInterbranchReceiverExactRow_(
      sourceJournalSheet,
      1,
      transferId
    );

  if (!receiverJournalRow) {
    throw new Error(
      'У журналі одержувача не знайдено переміщення ' +
      transferId
    );
  }

  if (!sourceJournalRow) {
    throw new Error(
      'У журналі відправника не знайдено переміщення ' +
      transferId
    );
  }

  const sourceLot =
    getInterbranchTransferSourceLot_(
      sourceStockSheet,
      sourceStockRow
    );

  if (
    interbranchPlannerNormalize_(
      sourceLot
        .currentTransferStatus
    ) !==
    interbranchPlannerNormalize_(
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .statuses
        .sourcePending
    )
  ) {
    throw new Error(
      'У відправника переміщення не має статусу очікування приймання.'
    );
  }

  if (
    Math.abs(
      interbranchPlannerNumber_(
        sourceLot
          .currentTransferQuantity
      ) -
      quantity
    ) >
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Кількість переміщення у відправника й одержувача не збігається.'
    );
  }

  if (
    interbranchPlannerNormalize_(
      sourceLot
        .currentTransferDestinationBranch
    ) !==
    interbranchPlannerNormalize_(
      receiverBranch.name
    )
  ) {
    throw new Error(
      'Філія-одержувач у записі відправника не збігається.'
    );
  }

  if (
    interbranchPlannerNormalize_(
      sourceLot.inventoryType
    ) !==
      interbranchPlannerNormalize_(
        receiverLot.inventoryType
      ) ||
    interbranchPlannerNormalize_(
      sourceLot.inventoryName
    ) !==
      interbranchPlannerNormalize_(
        receiverLot.inventoryName
      ) ||
    interbranchPlannerNormalize_(
      sourceLot.series
    ) !==
      interbranchPlannerNormalize_(
        receiverLot.series
      )
  ) {
    throw new Error(
      'Дані товару у відправника й одержувача не збігаються.'
    );
  }

  if (
    Math.abs(
      sourceLot.unitCost -
      receiverLot.unitCost
    ) > 0.01
  ) {
    throw new Error(
      'Собівартість у відправника й одержувача не збігається.'
    );
  }

  return {
    receiverSpreadsheet:
      receiverSpreadsheet,

    receiverBranch:
      receiverBranch,

    receiverStockSheet:
      receiverStockSheet,

    receiverMovementSheet:
      receiverMovementSheet,

    receiverJournalSheet:
      receiverJournalSheet,

    receiverRow:
      row,

    receiverLot:
      receiverLot,

    receiverJournalRow:
      receiverJournalRow,

    sourceSpreadsheet:
      sourceSpreadsheet,

    sourceBranchName:
      sourceBranchName,

    sourceStockSheet:
      sourceStockSheet,

    sourceMovementSheet:
      sourceMovementSheet,

    sourceJournalSheet:
      sourceJournalSheet,

    sourceStockRow:
      sourceStockRow,

    sourceJournalRow:
      sourceJournalRow,

    sourceLot:
      sourceLot,

    transferId:
      transferId,

    quantity:
      quantity,

    unitCost:
      receiverLot.unitCost,

    totalCost:
      interbranchPlannerRoundMoney_(
        quantity *
        receiverLot.unitCost
      )
  };
}


/****************************************************
 * РЯДОК СКЛАДУ ОДЕРЖУВАЧА ПІСЛЯ ПРИЙМАННЯ
 ****************************************************/

function buildInterbranchAcceptedReceiverRow_(
  context
) {
  const values =
    context.receiverLot
      .rawValues
      .slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  /*
   * I — прийнята кількість.
   */
  values[
    columns.received
  ] =
    context.quantity;

  /*
   * K — загальна вартість прийнятої партії.
   */
  values[
    columns.totalPurchaseCost
  ] =
    context.totalCost;

  /*
   * O — доступний залишок.
   */
  values[
    columns.currentBalance
  ] =
    context.quantity;

  /*
   * Q — статус партії.
   */
  values[
    columns.lotStatus
  ] =
    resolveInterbranchAcceptedLotStatus_(
      context.quantity,
      context.receiverLot
        .minimumStock
    );

  /*
   * X — статус переміщення.
   */
  values[
    columns.transferStatus
  ] =
    INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .statuses
      .accepted;

  /*
   * Y — дія очищується.
   */
  values[
    columns.transferAction
  ] =
    '';

  return values;
}


/****************************************************
 * РЯДОК СКЛАДУ ВІДПРАВНИКА ПІСЛЯ ПРИЙМАННЯ
 ****************************************************/

function buildInterbranchAcceptedSourceRow_(
  context
) {
  const values =
    context.sourceLot
      .rawValues
      .slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  /*
   * X — передача прийнята.
   */
  values[
    columns.transferStatus
  ] =
    INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .statuses
      .accepted;

  /*
   * Y — службова дія очищується.
   */
  values[
    columns.transferAction
  ] =
    '';

  return values;
}


/****************************************************
 * РЯДОК ЖУРНАЛУ ПІСЛЯ ПРИЙМАННЯ
 ****************************************************/

function buildInterbranchAcceptedJournalRow_(
  currentValues,
  user,
  acceptedAt
) {
  const values =
    currentValues.slice();

  const indexes =
    INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .journalIndexes;

  /*
   * N — статус.
   */
  values[
    indexes.status
  ] =
    INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .statuses
      .accepted;

  /*
   * Q — користувач приймання.
   */
  values[
    indexes.acceptedUser
  ] =
    user;

  /*
   * R — дата й час приймання.
   */
  values[
    indexes.acceptedAt
  ] =
    acceptedAt;

  /*
   * T — службова дія очищується.
   */
  values[
    indexes.action
  ] =
    '';

  return values;
}


/****************************************************
 * РУХ ПРИЙМАННЯ
 ****************************************************/

function buildInterbranchAcceptanceMovementRow_(
  context,
  movementId,
  user,
  acceptedAt
) {
  return [
    movementId,
    context.transferId,
    acceptedAt,
    context.receiverLot.inventoryType,
    context.receiverLot.inventoryName,
    context.receiverLot.lotId,
    INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .movementTypes
      .accepted,
    context.quantity,
    context.unitCost,
    context.totalCost,
    user,
    acceptedAt
  ];
}


/****************************************************
 * ВІДКАТ ПРИЙМАННЯ
 ****************************************************/

function rollbackInterbranchAcceptance_(
  transaction
) {
  const errors = [];

  if (
    !transaction ||
    !transaction.context ||
    !transaction.snapshot
  ) {
    return {
      ok:
        true,

      errors:
        errors
    };
  }

  const context =
    transaction.context;

  function safeRollback(
    callback
  ) {
    try {
      callback();

    } catch (error) {
      errors.push(
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
   * Видаляємо створений рух приймання.
   */
  if (
    transaction.receiverMovementId
  ) {
    safeRollback(
      function() {
        const movementRow =
          transaction
            .receiverMovementRow ||
          findInterbranchReceiverExactRow_(
            context
              .receiverMovementSheet,
            1,
            transaction
              .receiverMovementId
          );

        if (movementRow) {
          deleteInterbranchRowIfMatches_(
            context
              .receiverMovementSheet,
            movementRow,
            1,
            transaction
              .receiverMovementId
          );
        }
      }
    );
  }

  /*
   * Відновлюємо журнал відправника.
   */
  if (
    transaction.sourceJournalChanged
  ) {
    safeRollback(
      function() {
        context
          .sourceJournalSheet
          .getRange(
            context.sourceJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RECEIVER_CONFIG
              .journalColumnCount
          )
          .setValues([
            transaction
              .snapshot
              .sourceJournalValues
          ]);
      }
    );
  }

  /*
   * Відновлюємо журнал одержувача.
   */
  if (
    transaction.receiverJournalChanged
  ) {
    safeRollback(
      function() {
        context
          .receiverJournalSheet
          .getRange(
            context.receiverJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RECEIVER_CONFIG
              .journalColumnCount
          )
          .setValues([
            transaction
              .snapshot
              .receiverJournalValues
          ]);
      }
    );
  }

  /*
   * Відновлюємо склад відправника.
   */
  if (
    transaction.sourceStockChanged
  ) {
    safeRollback(
      function() {
        context
          .sourceStockSheet
          .getRange(
            context.sourceStockRow,
            1,
            1,
            INTERBRANCH_TRANSFER_PLANNER_CONFIG
              .stockColumnCount
          )
          .setValues([
            transaction
              .snapshot
              .sourceStockValues
          ]);
      }
    );
  }

  /*
   * Відновлюємо склад одержувача:
   * значення, фон і дропдаун.
   */
  if (
    transaction.receiverStockChanged
  ) {
    safeRollback(
      function() {
        const receiverRange =
          context
            .receiverStockSheet
            .getRange(
              context.receiverRow,
              1,
              1,
              INTERBRANCH_TRANSFER_PLANNER_CONFIG
                .stockColumnCount
            );

        receiverRange
          .setValues([
            transaction
              .snapshot
              .receiverStockValues
          ]);

        receiverRange
          .setBackgrounds([
            transaction
              .snapshot
              .receiverBackgrounds
          ]);

        context
          .receiverStockSheet
          .getRange(
            context.receiverRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .setDataValidation(
            transaction
              .snapshot
              .receiverActionValidation
          );
      }
    );
  }

  SpreadsheetApp.flush();

  return {
    ok:
      errors.length === 0,

    errors:
      errors
  };
}


/****************************************************
 * ПЕРЕВІРКА ФАКТИЧНИХ ЗАПИСІВ
 ****************************************************/

function verifyInterbranchAcceptance_(
  transaction
) {
  const context =
    transaction.context;

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const journalIndexes =
    INTERBRANCH_TRANSFER_RECEIVER_CONFIG
      .journalIndexes;

  const receiverValues =
    context
      .receiverStockSheet
      .getRange(
        context.receiverRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const sourceValues =
    context
      .sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const receiverJournal =
    context
      .receiverJournalSheet
      .getRange(
        context.receiverJournalRow,
        1,
        1,
        INTERBRANCH_TRANSFER_RECEIVER_CONFIG
          .journalColumnCount
      )
      .getValues()[0];

  const sourceJournal =
    context
      .sourceJournalSheet
      .getRange(
        context.sourceJournalRow,
        1,
        1,
        INTERBRANCH_TRANSFER_RECEIVER_CONFIG
          .journalColumnCount
      )
      .getValues()[0];

  const expectedLotStatus =
    resolveInterbranchAcceptedLotStatus_(
      context.quantity,
      context.receiverLot
        .minimumStock
    );

  const checks = {
    receiverAcceptedQuantity:
      Math.abs(
        interbranchPlannerNumber_(
          receiverValues[
            columns.received
          ]
        ) -
        context.quantity
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverTotalCost:
      Math.abs(
        interbranchPlannerNumber_(
          receiverValues[
            columns.totalPurchaseCost
          ]
        ) -
        context.totalCost
      ) <=
      0.01,

    receiverBalance:
      Math.abs(
        interbranchPlannerNumber_(
          receiverValues[
            columns.currentBalance
          ]
        ) -
        context.quantity
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverLotStatus:
      String(
        receiverValues[
          columns.lotStatus
        ] || ''
      ) ===
      expectedLotStatus,

    receiverTransferStatus:
      String(
        receiverValues[
          columns.transferStatus
        ] || ''
      ) ===
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .statuses
        .accepted,

    receiverActionCleared:
      String(
        receiverValues[
          columns.transferAction
        ] || ''
      ) ===
      '',

    receiverValidationCleared:
      context
        .receiverStockSheet
        .getRange(
          context.receiverRow,
          INTERBRANCH_TRANSFER_UI_CONFIG
            .actionColumn
        )
        .getDataValidation() ===
      null,

    sourceTransferStatus:
      String(
        sourceValues[
          columns.transferStatus
        ] || ''
      ) ===
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .statuses
        .accepted,

    receiverJournalAccepted:
      String(
        receiverJournal[
          journalIndexes.status
        ] || ''
      ) ===
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .statuses
        .accepted,

    sourceJournalAccepted:
      String(
        sourceJournal[
          journalIndexes.status
        ] || ''
      ) ===
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .statuses
        .accepted,

    receiverMovementExists:
      findInterbranchReceiverExactRow_(
        context
          .receiverMovementSheet,
        1,
        transaction
          .receiverMovementId
      ) >
      0
  };

  const ok =
    Object
      .keys(
        checks
      )
      .every(
        function(key) {
          return (
            checks[key] ===
            true
          );
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
 * ОСНОВНА ФУНКЦІЯ ПРИЙМАННЯ
 ****************************************************/

function executeInterbranchAcceptanceCore_( 
  request,
  options
 ) {
  assertInterbranchReceiverDependencies_();

  if (!request) {
    throw new Error(
      'Не передано параметри приймання.'
    );
  }

  const lock =
    LockService.getScriptLock();

  let lockAcquired =
    false;

  const transaction = {
    context:
      null,

    snapshot:
      null,

    receiverMovementId:
      '',

    receiverMovementRow:
      0,

    receiverStockChanged:
      false,

    sourceStockChanged:
      false,

    receiverJournalChanged:
      false,

    sourceJournalChanged:
      false
  };

  try {
    lock.waitLock(
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .lockTimeoutMs
    );

    lockAcquired =
      true;

    const context =
      getInterbranchReceiverContextByRow_(
        request.row
      );

    transaction.context =
      context;

    const expectedAction =
      INTERBRANCH_TRANSFER_UI_CONFIG
        .actions
        .accept;

    if (
      interbranchPlannerNormalize_(
        context
          .receiverLot
          .currentTransferAction
      ) !==
      interbranchPlannerNormalize_(
        expectedAction
      )
    ) {
      throw new Error(
        'У колонці Y вибраного рядка має бути встановлено «Прийняти».'
      );
    }

    const movementId =
      context.transferId +
      '-MOV-IN-ACCEPT';

    transaction.receiverMovementId =
      movementId;

    /*
     * Захист від повторного приймання.
     */
    if (
      findInterbranchReceiverExactRow_(
        context
          .receiverMovementSheet,
        1,
        movementId
      )
    ) {
      throw new Error(
        'Рух приймання вже існує: ' +
        movementId
      );
    }

    const receiverRange =
      context
        .receiverStockSheet
        .getRange(
          context.receiverRow,
          1,
          1,
          INTERBRANCH_TRANSFER_PLANNER_CONFIG
            .stockColumnCount
        );

    /*
     * Зберігаємо повний стан перед записами.
     */
    transaction.snapshot = {
      receiverStockValues:
        receiverRange
          .getValues()[0],

      receiverBackgrounds:
        receiverRange
          .getBackgrounds()[0],

      receiverActionValidation:
        context
          .receiverStockSheet
          .getRange(
            context.receiverRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .getDataValidation(),

      sourceStockValues:
        context
          .sourceStockSheet
          .getRange(
            context.sourceStockRow,
            1,
            1,
            INTERBRANCH_TRANSFER_PLANNER_CONFIG
              .stockColumnCount
          )
          .getValues()[0],

      receiverJournalValues:
        context
          .receiverJournalSheet
          .getRange(
            context.receiverJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RECEIVER_CONFIG
              .journalColumnCount
          )
          .getValues()[0],

      sourceJournalValues:
        context
          .sourceJournalSheet
          .getRange(
            context.sourceJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RECEIVER_CONFIG
              .journalColumnCount
          )
          .getValues()[0]
    };

    const acceptedAt =
      new Date();

    const user =
      getInterbranchWriteUser_();

    /************************************************
     * КРОК 1 — СКЛАД ОДЕРЖУВАЧА
     ************************************************/

    receiverRange
      .setValues([
        buildInterbranchAcceptedReceiverRow_(
          context
        )
      ]);

    transaction.receiverStockChanged =
      true;

    /*
     * Прибираємо червону підсвітку.
     */
    receiverRange
      .setBackground(
        null
      );

    /*
     * Прибираємо дропдаун із Y.
     */
    context
      .receiverStockSheet
      .getRange(
        context.receiverRow,
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actionColumn
      )
      .clearDataValidations();

    maybeForceInterbranchReceiverFailure_(
      'afterReceiverStock',
      options
    );

    /************************************************
     * КРОК 2 — СКЛАД ВІДПРАВНИКА
     ************************************************/

    context
      .sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .setValues([
        buildInterbranchAcceptedSourceRow_(
          context
        )
      ]);

    transaction.sourceStockChanged =
      true;

    maybeForceInterbranchReceiverFailure_(
      'afterSourceStock',
      options
    );

    /************************************************
     * КРОК 3 — ЖУРНАЛ ОДЕРЖУВАЧА
     ************************************************/

    context
      .receiverJournalSheet
      .getRange(
        context.receiverJournalRow,
        1,
        1,
        INTERBRANCH_TRANSFER_RECEIVER_CONFIG
          .journalColumnCount
      )
      .setValues([
        buildInterbranchAcceptedJournalRow_(
          transaction
            .snapshot
            .receiverJournalValues,
          user,
          acceptedAt
        )
      ]);

    transaction.receiverJournalChanged =
      true;

    maybeForceInterbranchReceiverFailure_(
      'afterReceiverJournal',
      options
    );

    /************************************************
     * КРОК 4 — ЖУРНАЛ ВІДПРАВНИКА
     ************************************************/

    context
      .sourceJournalSheet
      .getRange(
        context.sourceJournalRow,
        1,
        1,
        INTERBRANCH_TRANSFER_RECEIVER_CONFIG
          .journalColumnCount
      )
      .setValues([
        buildInterbranchAcceptedJournalRow_(
          transaction
            .snapshot
            .sourceJournalValues,
          user,
          acceptedAt
        )
      ]);

    transaction.sourceJournalChanged =
      true;

    maybeForceInterbranchReceiverFailure_(
      'afterSourceJournal',
      options
    );

    /************************************************
     * КРОК 5 — РУХ СКЛАДУ ОДЕРЖУВАЧА
     ************************************************/

    transaction.receiverMovementRow =
      appendInterbranchWriteRow_(
        context
          .receiverMovementSheet,
        buildInterbranchAcceptanceMovementRow_(
          context,
          movementId,
          user,
          acceptedAt
        )
      );

    SpreadsheetApp.flush();

    maybeForceInterbranchReceiverFailure_(
      'afterAllWrites',
      options
    );

    /************************************************
     * КРОК 6 — КОНТРОЛЬНА ПЕРЕВІРКА
     ************************************************/

    const verification =
      verifyInterbranchAcceptance_(
        transaction
      );

    if (!verification.ok) {
      throw new Error(
        'Контрольна перевірка приймання не пройдена: ' +
        JSON.stringify(
          verification.checks
        )
      );
    }
        /*
     * КРОК 7 — ВЗАЄМОРОЗРАХУНОК ФІЛІЙ
     *
     * Створює дзеркальний запис лише для
     * прийнятої передачі Альтернатива → Бабурка.
     */
    const settlement =
      createInterbranchSettlementAfterAcceptance_(
        context,
        acceptedAt,
        user
      );
 /*
 * Після успішного приймання обидві партії знову
 * можуть бути доступними для наступного переміщення.
 *
 * Помилка інтерфейсу не відкочує вже коректно
 * проведений складський рух.
 */
 const receiverUiRefresh =
  refreshInterbranchPostAcceptanceUi_(
    context.receiverSpreadsheet,
    context.receiverStockSheet,
    context.receiverRow
  );

 const sourceUiRefresh =
  refreshInterbranchPostAcceptanceUi_(
    context.sourceSpreadsheet,
    context.sourceStockSheet,
    context.sourceStockRow
  );
    return {
      ok:
        true,

      transferId:
        context.transferId,

      receiverLotId:
        context.receiverLot
          .lotId,

      sourceBranch:
        context.sourceBranchName,

      destinationBranch:
        context.receiverBranch
          .name,

      inventoryType:
        context.receiverLot
          .inventoryType,

      inventoryName:
        context.receiverLot
          .inventoryName,

      quantity:
        context.quantity,

      unitCost:
        context.unitCost,

      totalCost:
        context.totalCost,

      receiverBalance:
        context.quantity,

      receiverLotStatus:
        resolveInterbranchAcceptedLotStatus_(
          context.quantity,
          context.receiverLot
            .minimumStock
        ),

      transferStatus:
        INTERBRANCH_TRANSFER_RECEIVER_CONFIG
          .statuses
          .accepted,

      verification:
        verification,
 receiverUiRefresh:
  receiverUiRefresh,

 sourceUiRefresh:
  sourceUiRefresh,
   settlement:
        settlement,
      rolledBack:
        false
    };

  } catch (error) {
    const rollback =
      rollbackInterbranchAcceptance_(
        transaction
      );

    if (!rollback.ok) {
      throw new Error(
        'КРИТИЧНА ПОМИЛКА. Приймання не вдалося повністю відкотити.\n\n' +
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
      'Приймання скасовано і повністю відкочено.\n\n' +
      String(
        error &&
        error.message
          ? error.message
          : error
      )
    );

  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}


/****************************************************
 * ВИКЛИК ПРИЙМАННЯ З HTML-ДІАЛОГУ
 ****************************************************/

function executeInterbranchAcceptanceFromDialog(
  request
) {
  assertInterbranchReceiverDependencies_();

  if (!request) {
    throw new Error(
      'Не передано параметри приймання.'
    );
  }

  const action =
    String(
      request.action || ''
    ).trim();

  const expectedAction =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .accept;

  if (
    interbranchPlannerNormalize_(
      action
    ) !==
    interbranchPlannerNormalize_(
      expectedAction
    )
  ) {
    throw new Error(
      'Для цієї операції очікується дія «Прийняти».'
    );
  }

  const row =
    Number(
      request.row
    ) || 0;

  if (row < 2) {
    throw new Error(
      'Некоректний рядок приймання.'
    );
  }

  const result =
    executeInterbranchAcceptanceCore_(
      {
        row:
          row
      },
      {}
    );

  SpreadsheetApp
    .getActive()
    .toast(
      'Товар прийнято: ' +
      result.inventoryName +
      ', ' +
      result.quantity +
      ' од.',
      'Переміщення між філіями',
      10
    );

  return JSON.parse(
    JSON.stringify(
      result
    )
  );
}


/****************************************************
 * ПОШУК РЯДКА ДЛЯ ТЕСТУ ВІДКАТУ
 ****************************************************/

function getInterbranchAcceptTestContext_() {
  assertInterbranchReceiverDependencies_();

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    spreadsheet
      .getSheetByName(
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock
      );

  if (!stockSheet) {
    throw new Error(
      'Не знайдено лист складу.'
    );
  }

  const acceptAction =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .accept;

  const candidateRows = [];

  /*
   * Спочатку пробуємо активний рядок.
   */
  const activeSheet =
    spreadsheet.getActiveSheet();

  const activeRange =
    spreadsheet.getActiveRange();

  if (
    activeSheet &&
    activeRange &&
    activeSheet.getSheetId() ===
      stockSheet.getSheetId() &&
    activeRange.getRow() >= 2
  ) {
    candidateRows.push(
      activeRange.getRow()
    );
  }

  /*
   * Потім шукаємо всі рядки з дією «Прийняти».
   */
  const lastRow =
    stockSheet.getLastRow();

  if (lastRow >= 2) {
    const actions =
      stockSheet
        .getRange(
          2,
          INTERBRANCH_TRANSFER_UI_CONFIG
            .actionColumn,
          lastRow - 1,
          1
        )
        .getDisplayValues();

    actions.forEach(
      function(
        rowValues,
        index
      ) {
        const action =
          String(
            rowValues[0] || ''
          ).trim();

        const row =
          index + 2;

        if (
          interbranchPlannerNormalize_(
            action
          ) ===
            interbranchPlannerNormalize_(
              acceptAction
            ) &&
          candidateRows.indexOf(
            row
          ) ===
            -1
        ) {
          candidateRows.push(
            row
          );
        }
      }
    );
  }

  for (
    let index = 0;
    index < candidateRows.length;
    index++
  ) {
    const row =
      candidateRows[index];

    const lot =
      getInterbranchTransferSourceLot_(
        stockSheet,
        row
      );

    if (
      interbranchPlannerNormalize_(
        lot.currentTransferAction
      ) ===
      interbranchPlannerNormalize_(
        acceptAction
      )
    ) {
      return getInterbranchReceiverContextByRow_(
        row
      );
    }
  }

  throw new Error(
    'Не знайдено рядка, де в колонці Y обрано «Прийняти».'
  );
}


/****************************************************
 * ЗНІМОК СТАНУ ДЛЯ ТЕСТУ
 ****************************************************/

function snapshotInterbranchAcceptanceState_(
  context
) {
  const receiverRange =
    context
      .receiverStockSheet
      .getRange(
        context.receiverRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      );

  return {
    receiverMovementLastRow:
      context
        .receiverMovementSheet
        .getLastRow(),

    receiverStockValues:
      JSON.stringify(
        receiverRange
          .getValues()[0]
      ),

    receiverBackgrounds:
      JSON.stringify(
        receiverRange
          .getBackgrounds()[0]
      ),

    receiverActionValidation:
      getInterbranchReceiverValidationSignature_(
        context
          .receiverStockSheet
          .getRange(
            context.receiverRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
      ),

    sourceStockValues:
      JSON.stringify(
        context
          .sourceStockSheet
          .getRange(
            context.sourceStockRow,
            1,
            1,
            INTERBRANCH_TRANSFER_PLANNER_CONFIG
              .stockColumnCount
          )
          .getValues()[0]
      ),

    receiverJournalValues:
      JSON.stringify(
        context
          .receiverJournalSheet
          .getRange(
            context.receiverJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RECEIVER_CONFIG
              .journalColumnCount
          )
          .getValues()[0]
      ),

    sourceJournalValues:
      JSON.stringify(
        context
          .sourceJournalSheet
          .getRange(
            context.sourceJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RECEIVER_CONFIG
              .journalColumnCount
          )
          .getValues()[0]
      )
  };
}


/****************************************************
 * ТЕСТ КОНТРОЛЬОВАНОГО ВІДКАТУ
 ****************************************************/

function testInterbranchTransferAcceptRollback() {
  assertInterbranchReceiverDependencies_();

  const context =
    getInterbranchAcceptTestContext_();

  const beforeState =
    snapshotInterbranchAcceptanceState_(
      context
    );

  let expectedFailureOccurred =
    false;

  let failureMessage =
    '';

  try {
    executeInterbranchAcceptanceCore_(
      {
        row:
          context.receiverRow
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

  const refreshedContext =
    getInterbranchReceiverContextByRow_(
      context.receiverRow
    );

  const afterState =
    snapshotInterbranchAcceptanceState_(
      refreshedContext
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

    receiverMovementRowsRestored:
      beforeState
        .receiverMovementLastRow ===
      afterState
        .receiverMovementLastRow,

    receiverStockValuesRestored:
      beforeState
        .receiverStockValues ===
      afterState
        .receiverStockValues,

    receiverBackgroundRestored:
      beforeState
        .receiverBackgrounds ===
      afterState
        .receiverBackgrounds,

    receiverDropdownRestored:
      beforeState
        .receiverActionValidation ===
      afterState
        .receiverActionValidation,

    sourceStockRestored:
      beforeState
        .sourceStockValues ===
      afterState
        .sourceStockValues,

    receiverJournalRestored:
      beforeState
        .receiverJournalValues ===
      afterState
        .receiverJournalValues,

    sourceJournalRestored:
      beforeState
        .sourceJournalValues ===
      afterState
        .sourceJournalValues,

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
      'testInterbranchTransferAcceptRollback',

    version:
      INTERBRANCH_TRANSFER_RECEIVER_CONFIG
        .version,

    transferId:
      context.transferId,

    sourceBranch:
      context.sourceBranchName,

    destinationBranch:
      context.receiverBranch
        .name,

    receiverRow:
      context.receiverRow,

    receiverLotId:
      context.receiverLot
        .lotId,

    quantity:
      context.quantity,

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
            'Контрольований відкат приймання пройдено. ' +
            'Передача залишилася в очікуванні.'
          )
        : (
            'Тест відкату приймання не пройдено. ' +
            'Перевірте журнал виконання.'
          ),
      'Переміщення між філіями',
      10
    );

  if (!ok) {
    throw new Error(
      'Тест контрольованого відкату приймання не пройдено.'
    );
  }

  return result;
}
/**
 * Відновлює доступні дії та актуальний вигляд складу
 * після успішного приймання міжфілійного переміщення.
 *
 * Не змінює облікові дані: лише dropdown Y і видимість
 * рядків відповідно до чинного фільтра D2.
 */
function refreshInterbranchPostAcceptanceUi_(
  spreadsheet,
  stockSheet,
  row
) {
  const result = {
    row: row,
    actionDropdown: null,
    stockFilter: null,
    warnings: []
  };

  try {
    result.actionDropdown =
      refreshInterbranchActionValidationForRow_(
        spreadsheet,
        row
      );
  } catch (error) {
    result.warnings.push(
      'Dropdown Y: ' +
      String(error.message || error)
    );
  }

  /*
   * Якщо в таблиці є модуль фільтра D2 —
   * повторно застосовуємо його після зміни залишку.
   * Так новоприйнята активна партія одразу стає видимою
   * в режимі «Показати весь склад».
   */
  try {
    if (
      typeof INVENTORY_PRODUCT_SEARCH_CONFIG !==
        'undefined' &&
      typeof applyInventoryProductSearchFilter_ ===
        'function'
    ) {
      const searchCell =
        stockSheet.getRange(
          INVENTORY_PRODUCT_SEARCH_CONFIG
            .searchCell
        );

      result.stockFilter =
        applyInventoryProductSearchFilter_(
          stockSheet,
          searchCell.getDisplayValue()
        );
    }
  } catch (error) {
    result.warnings.push(
      'Фільтр складу: ' +
      String(error.message || error)
    );
  }

  return result;
}
/**
 * R0 — аудит готовності до модуля
 * «Взаєморозрахунки філій».
 *
 * Нічого не записує і не змінює.
 */
function auditInterbranchSettlementReadiness() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheetNames = {
    stock:
      'Склад медичних запасів',

    transfers:
      'Переміщення між філіями',

    movement:
      'Рух складу',

    lifecycle:
      'Журнал життєвого циклу'
  };

    const expectedHeaders = {
    stock: [
      'ID партії',
      'Найменування',
      'Прийнято',
      'Собівартість одиниці',
      'Поточний залишок',
      'ID переміщення',
      'Філія-відправник',
      'Філія-одержувач',
      'Кількість переміщення',
      'Статус переміщення'
    ],

    transfers: [
      'ID переміщення',
      'Філія-відправник',
      'Філія-одержувач',
      'Кількість',
      'Статус'
    ]
  };

 function readHeaders_(sheet) {
    if (!sheet) {
      return [];
    }

    return sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0]
      .map(function(value) {
        return String(value || '').trim();
      });
  }

 function inspectSheet_(key) {
    const sheet =
      ss.getSheetByName(
        sheetNames[key]
      );

    if (!sheet) {
      return {
        exists: false,
        sheetName: sheetNames[key]
      };
    }

    const headers =
      readHeaders_(sheet);

    const required =
      expectedHeaders[key] || [];

    const missingHeaders =
      required.filter(function(header) {
        return headers.indexOf(header) === -1;
      });

    return {
      exists: true,
      sheetName: sheet.getName(),
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      headers: headers,
      missingHeaders: missingHeaders,
      ready:
        missingHeaders.length === 0
    };
  }

  const stock =
    inspectSheet_('stock');

  const transfers =
    inspectSheet_('transfers');

  const movement =
    inspectSheet_('movement');

  const lifecycle =
    inspectSheet_('lifecycle');

  const result = {
        ok:
      stock.exists &&
      stock.ready &&
      transfers.exists &&
      transfers.ready &&
      movement.exists &&
      lifecycle.exists,
    test:
      'auditInterbranchSettlementReadiness',

    writesNow:
      false,

    spreadsheet:
      ss.getName(),

    checkedAt:
      new Date(),

    sheets: {
      stock: stock,
      transfers: transfers,
      movement: movement,
      lifecycle: lifecycle
    },
    accountingStartDate:
      INTERBRANCH_SETTLEMENTS_CONFIG
        .accountingStartDate,
    nextDecision:
      (
        stock.ready &&
        transfers.ready
      )
        ? 'READY_FOR_STEP_2_REGISTER_SCHEMA'
        : 'STOP_AND_ADAPT_TO_ACTUAL_HEADERS'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function createInterbranchSettlementAfterAcceptance_(
  context,
  acceptedAt,
  user
 ) {
  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const sourceBranch =
    String(
      context.sourceBranchName || ''
    ).trim();

  const destinationBranch =
    String(
      context.receiverBranch.name || ''
    ).trim();

  /*
   * Наразі автоматизуємо лише погоджений напрямок.
   */
  if (
    sourceBranch !== config.creditorBranch ||
    destinationBranch !== config.debtorBranch
  ) {
    return {
      ok: true,
      writesNow: false,
      applicable: false,
      reason: 'OUT_OF_SCOPE_DIRECTION'
    };
  }

  const accrualDate =
    acceptedAt instanceof Date
      ? acceptedAt
      : new Date(acceptedAt);

  const accountingStartDate =
    new Date(
      config.accountingStartDate +
      'T00:00:00'
    );

  if (
    accrualDate < accountingStartDate
  ) {
    return {
      ok: true,
      writesNow: false,
      applicable: false,
      reason: 'BEFORE_ACCOUNTING_START_DATE'
    };
  }

  const transferId =
    String(
      context.transferId || ''
    ).trim();

  if (!transferId) {
    throw new Error(
      'Не визначено ID прийнятого переміщення.'
    );
  }

  const settlementId =
    'SET-' + transferId;

  const alternativeSheet =
    context.sourceSpreadsheet.getSheetByName(
      config.settlementSheetName
    );

  const baburkaSheet =
    context.receiverSpreadsheet.getSheetByName(
      config.settlementSheetName
    );

  if (
    !alternativeSheet ||
    !baburkaSheet
  ) {
    throw new Error(
      'Не знайдено лист "' +
      config.settlementSheetName +
      '" в одній із філій.'
    );
  }

  function hasSettlementId_(sheet, id) {
    return Boolean(
      sheet
        .getRange(
          2,
          1,
          Math.max(
            sheet.getLastRow() - 1,
            1
          ),
          1
        )
        .createTextFinder(id)
        .matchEntireCell(true)
        .findNext()
    );
  }

  const existsInAlternative =
    hasSettlementId_(
      alternativeSheet,
      settlementId
    );

  const existsInBaburka =
    hasSettlementId_(
      baburkaSheet,
      settlementId
    );

  /*
   * Повторне натискання або повторний запуск
   * не створюють дубль.
   */
  if (
    existsInAlternative &&
    existsInBaburka
  ) {
    return {
      ok: true,
      writesNow: false,
      applicable: true,
      alreadyExists: true,
      settlementId: settlementId,
      transferId: transferId
    };
  }

  /*
   * Один запис без дзеркального — критична ситуація.
   * Автоматично не дописуємо другу сторону.
   */
  if (
    existsInAlternative ||
    existsInBaburka
  ) {
    throw new Error(
      'Знайдено частковий взаєморозрахунок для ' +
      transferId +
      '. Автоматичний запис зупинено.'
    );
  }

  const accrualMonth =
    Utilities.formatDate(
      accrualDate,
      Session.getScriptTimeZone(),
      'yyyy-MM'
    );

  const monthEnd =
    new Date(
      accrualDate.getFullYear(),
      accrualDate.getMonth() + 1,
      0
    );

  const totalCost =
    Math.round(
      Number(context.totalCost || 0) * 100
    ) / 100;

  if (totalCost <= 0) {
    throw new Error(
      'Некоректна сума собівартості для ' +
      transferId + '.'
    );
  }

  const row = [
    settlementId,
    transferId,
    accrualDate,
    accrualMonth,
    config.creditorBranch,
    config.debtorBranch,
    String(context.receiverLot.inventoryName || '') +
      ' | серія: ' +
      String(context.receiverLot.series || '') +
      ' | ' +
      String(context.sourceLot.lotId || '') +
      ' → ' +
      String(context.receiverLot.lotId || ''),
    context.quantity,
    context.unitCost,
    totalCost,
    monthEnd,
    0,
    totalCost,
    'Нараховано',
    '',
    'Автоматично після приймання; користувач: ' +
      String(user || 'невідомий користувач')
  ];

  let alternativeRow = 0;
  let baburkaRow = 0;

  function rollbackOwnSettlementRow_(
    sheet,
    rowNumber
  ) {
    if (!rowNumber) {
      return;
    }

    const currentId =
      String(
        sheet
          .getRange(
            rowNumber,
            1
          )
          .getDisplayValue() || ''
      ).trim();

    if (
      sheet.getLastRow() === rowNumber &&
      currentId === settlementId
    ) {
      sheet.deleteRow(rowNumber);
    }
  }

  try {
    alternativeRow =
      alternativeSheet.getLastRow() + 1;

    alternativeSheet
      .getRange(
        alternativeRow,
        1,
        1,
        row.length
      )
      .setValues([row]);

    baburkaRow =
      baburkaSheet.getLastRow() + 1;

    baburkaSheet
      .getRange(
        baburkaRow,
        1,
        1,
        row.length
      )
      .setValues([row]);

       SpreadsheetApp.flush();

    let dashboardRefresh = {
      alternative: null,
      baburka: null,
      warning: ''
    };

    try {
      dashboardRefresh.alternative =
        refreshInterbranchSettlementDashboardCardsForSpreadsheet_(
          context.sourceSpreadsheet
        );

      dashboardRefresh.baburka =
        refreshInterbranchSettlementDashboardCardsForSpreadsheet_(
          context.receiverSpreadsheet
        );

      SpreadsheetApp.flush();
    } catch (dashboardError) {
      dashboardRefresh.warning =
        String(
          dashboardError &&
          dashboardError.message
            ? dashboardError.message
            : dashboardError
        );

      console.log(
        'Не вдалося оновити картки: ' +
        dashboardRefresh.warning
      );
    }

    return {
      ok: true,
      writesNow: true,
      applicable: true,
      alreadyExists: false,
      settlementId: settlementId,
      transferId: transferId,
      accrualMonth: accrualMonth,
      amount: totalCost,
      alternativeRow: alternativeRow,
      baburkaRow: baburkaRow,
      dashboardRefresh: dashboardRefresh
    };

  } catch (error) {
    /*
     * Не залишаємо односторонній запис,
     * якщо запис у другій філії не вдався.
     */
    rollbackOwnSettlementRow_(
      baburkaSheet,
      baburkaRow
    );

    rollbackOwnSettlementRow_(
      alternativeSheet,
      alternativeRow
    );

    SpreadsheetApp.flush();

    throw error;
  }
}