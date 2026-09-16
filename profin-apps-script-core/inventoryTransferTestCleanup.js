/****************************************************
 * PROFIN OS — КОНТРОЛЬОВАНЕ ОЧИЩЕННЯ
 * ЗАВЕРШЕНОГО ТЕСТОВОГО ПЕРЕМІЩЕННЯ
 *
 * ЕТАП А: ТІЛЬКИ СУХИЙ АУДИТ
 *
 * ЦЯ ФУНКЦІЯ:
 * — нічого не змінює;
 * — нічого не видаляє;
 * — перевіряє точний тестовий ID;
 * — знаходить усі пов’язані записи;
 * — перевіряє відсутність подальшого використання;
 * — підтверджує готовність до безпечного очищення.
 ****************************************************/


const INTERBRANCH_TEST_CLEANUP_CONFIG =
  Object.freeze({

    version:
      '1.0',

    transferId:
      'TRF-ALT-BAB-20260724-152537-FD940C',

    sourceBranch:
      'Альтернатива',

    destinationBranch:
      'Бабурка',

    sourceLotId:
      'L-20260722-856-LOT-1',

    receiverLotId:
      'TRF-ALT-BAB-20260724-152537-FD940C-LOT-IN',

    quantity:
      1,

    expectedSourceBalance:
      5,

    expectedSourceTransferred:
      1,

    expectedReceiverBalance:
      1,

    expectedStatus:
      'Прийнято',

    movementColumnCount:
      12,

    journalColumnCount:
      20
  });


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assertInterbranchTestCleanupDependencies_() {
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
    typeof interbranchPlannerNormalize_ !==
    'function'
  ) {
    missing.push(
      'interbranchPlannerNormalize_()'
    );
  }

  if (missing.length > 0) {
    throw new Error(
      'Не вистачає залежностей для аудиту:\n' +
      missing.join('\n')
    );
  }

  return true;
}


/****************************************************
 * ТОЧНЕ ПОРІВНЯННЯ ТЕКСТУ
 ****************************************************/

function interbranchCleanupEquals_(
  firstValue,
  secondValue
) {
  return (
    interbranchPlannerNormalize_(
      firstValue
    ) ===
    interbranchPlannerNormalize_(
      secondValue
    )
  );
}


/****************************************************
 * ПОШУК УСІХ РЯДКІВ З ТОЧНИМ ЗНАЧЕННЯМ
 ****************************************************/

function findInterbranchCleanupRows_(
  sheet,
  column,
  expectedValue
) {
  if (!sheet) {
    return [];
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
    return [];
  }

  const values =
    sheet
      .getRange(
        2,
        column,
        lastRow - 1,
        1
      )
      .getDisplayValues();

  const rows = [];

  values.forEach(
    function(
      rowValues,
      index
    ) {
      const actual =
        String(
          rowValues[0] || ''
        ).trim();

      if (actual === expected) {
        rows.push(
          index + 2
        );
      }
    }
  );

  return rows;
}


/****************************************************
 * ЧИТАННЯ РЯДКА
 ****************************************************/

function getInterbranchCleanupRowValues_(
  sheet,
  row,
  columnCount
) {
  return sheet
    .getRange(
      row,
      1,
      1,
      columnCount
    )
    .getValues()[0];
}


/****************************************************
 * ЧИТАННЯ РУХІВ ЗА ID ОПЕРАЦІЇ
 *
 * У листі «Рух складу»:
 * B — ID операції / переміщення
 * G — тип руху
 ****************************************************/

function getInterbranchCleanupMovements_(
  movementSheet,
  transferId
) {
  const rows =
    findInterbranchCleanupRows_(
      movementSheet,
      2,
      transferId
    );

  return rows.map(
    function(row) {
      const values =
        getInterbranchCleanupRowValues_(
          movementSheet,
          row,
          INTERBRANCH_TEST_CLEANUP_CONFIG
            .movementColumnCount
        );

      return {
        row:
          row,

        movementId:
          String(
            values[0] || ''
          ).trim(),

        operationId:
          String(
            values[1] || ''
          ).trim(),

        lotId:
          String(
            values[5] || ''
          ).trim(),

        movementType:
          String(
            values[6] || ''
          ).trim(),

        quantity:
          interbranchPlannerNumber_(
            values[7]
          ),

        unitCost:
          interbranchPlannerNumber_(
            values[8]
          ),

        totalCost:
          interbranchPlannerNumber_(
            values[9]
          )
      };
    }
  );
}


/****************************************************
 * ПЕРЕВІРКА НАЯВНОСТІ ТИПУ РУХУ
 ****************************************************/

function interbranchCleanupHasMovementType_(
  movements,
  expectedType
) {
  return movements.some(
    function(movement) {
      return interbranchCleanupEquals_(
        movement.movementType,
        expectedType
      );
    }
  );
}


/****************************************************
 * СУХИЙ АУДИТ
 *
 * НІЧОГО НЕ ЗМІНЮЄ.
 ****************************************************/

function auditCompletedInterbranchTestTransferForCancellation() {
  assertInterbranchTestCleanupDependencies_();

  const config =
    INTERBRANCH_TEST_CLEANUP_CONFIG;

  const sourceConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[
        config.sourceBranch
      ];

  const destinationConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[
        config.destinationBranch
      ];

  if (!sourceConfig) {
    throw new Error(
      'Не знайдено конфігурацію філії «' +
      config.sourceBranch +
      '».'
    );
  }

  if (!destinationConfig) {
    throw new Error(
      'Не знайдено конфігурацію філії «' +
      config.destinationBranch +
      '».'
    );
  }

  const sourceSpreadsheet =
    SpreadsheetApp.openById(
      sourceConfig.spreadsheetId
    );

  const destinationSpreadsheet =
    SpreadsheetApp.openById(
      destinationConfig.spreadsheetId
    );

  const sheetNames =
    INTERBRANCH_TRANSFER_CONFIG
      .sheetNames;

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

  const destinationStockSheet =
    destinationSpreadsheet
      .getSheetByName(
        sheetNames.stock
      );

  const destinationMovementSheet =
    destinationSpreadsheet
      .getSheetByName(
        sheetNames.movement
      );

  const destinationJournalSheet =
    destinationSpreadsheet
      .getSheetByName(
        sheetNames.transferJournal
      );

  if (
    !sourceStockSheet ||
    !sourceMovementSheet ||
    !sourceJournalSheet
  ) {
    throw new Error(
      'У таблиці Альтернативи відсутній один із робочих листів.'
    );
  }

  if (
    !destinationStockSheet ||
    !destinationMovementSheet ||
    !destinationJournalSheet
  ) {
    throw new Error(
      'У таблиці Бабурки відсутній один із робочих листів.'
    );
  }

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  /*
   * Шукаємо складські записи за ID переміщення
   * у колонці T.
   */
  const sourceStockRows =
    findInterbranchCleanupRows_(
      sourceStockSheet,
      columns.transferId + 1,
      config.transferId
    );

  const destinationStockRows =
    findInterbranchCleanupRows_(
      destinationStockSheet,
      columns.transferId + 1,
      config.transferId
    );

  /*
   * Шукаємо журнали за ID переміщення
   * у колонці A.
   */
  const sourceJournalRows =
    findInterbranchCleanupRows_(
      sourceJournalSheet,
      1,
      config.transferId
    );

  const destinationJournalRows =
    findInterbranchCleanupRows_(
      destinationJournalSheet,
      1,
      config.transferId
    );

  /*
   * Шукаємо рухи за ID операції
   * у колонці B.
   */
  const sourceMovements =
    getInterbranchCleanupMovements_(
      sourceMovementSheet,
      config.transferId
    );

  const destinationMovements =
    getInterbranchCleanupMovements_(
      destinationMovementSheet,
      config.transferId
    );

  let sourceLot =
    null;

  let destinationLot =
    null;

  let sourceJournalValues =
    null;

  let destinationJournalValues =
    null;

  if (sourceStockRows.length === 1) {
    sourceLot =
      getInterbranchTransferSourceLot_(
        sourceStockSheet,
        sourceStockRows[0]
      );
  }

  if (destinationStockRows.length === 1) {
    destinationLot =
      getInterbranchTransferSourceLot_(
        destinationStockSheet,
        destinationStockRows[0]
      );
  }

  if (sourceJournalRows.length === 1) {
    sourceJournalValues =
      getInterbranchCleanupRowValues_(
        sourceJournalSheet,
        sourceJournalRows[0],
        config.journalColumnCount
      );
  }

  if (destinationJournalRows.length === 1) {
    destinationJournalValues =
      getInterbranchCleanupRowValues_(
        destinationJournalSheet,
        destinationJournalRows[0],
        config.journalColumnCount
      );
  }

  const checks = {
    sourceStockRowFoundExactlyOnce:
      sourceStockRows.length === 1,

    destinationStockRowFoundExactlyOnce:
      destinationStockRows.length === 1,

    sourceJournalFoundExactlyOnce:
      sourceJournalRows.length === 1,

    destinationJournalFoundExactlyOnce:
      destinationJournalRows.length === 1,

    sourceMovementCountCorrect:
      sourceMovements.length === 1,

    destinationMovementCountCorrect:
      destinationMovements.length === 2,

    sourceLotIdCorrect:
      Boolean(
        sourceLot
      ) &&
      sourceLot.lotId ===
        config.sourceLotId,

    destinationLotIdCorrect:
      Boolean(
        destinationLot
      ) &&
      destinationLot.lotId ===
        config.receiverLotId,

    sourceTransferStatusAccepted:
      Boolean(
        sourceLot
      ) &&
      interbranchCleanupEquals_(
        sourceLot.currentTransferStatus,
        config.expectedStatus
      ),

    destinationTransferStatusAccepted:
      Boolean(
        destinationLot
      ) &&
      interbranchCleanupEquals_(
        destinationLot.currentTransferStatus,
        config.expectedStatus
      ),

    sourceTransferQuantityCorrect:
      Boolean(
        sourceLot
      ) &&
      Math.abs(
        sourceLot.currentTransferQuantity -
        config.quantity
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    destinationTransferQuantityCorrect:
      Boolean(
        destinationLot
      ) &&
      Math.abs(
        destinationLot.currentTransferQuantity -
        config.quantity
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    sourceBalanceStillExpected:
      Boolean(
        sourceLot
      ) &&
      Math.abs(
        sourceLot.currentBalance -
        config.expectedSourceBalance
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    sourceTransferredCounterStillExpected:
      Boolean(
        sourceLot
      ) &&
      Math.abs(
        sourceLot.transferredToBranches -
        config.expectedSourceTransferred
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverAcceptedQuantityStillExpected:
      Boolean(
        destinationLot
      ) &&
      Math.abs(
        destinationLot.received -
        config.quantity
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverBalanceStillExpected:
      Boolean(
        destinationLot
      ) &&
      Math.abs(
        destinationLot.currentBalance -
        config.expectedReceiverBalance
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverNotSoldOrUsed:
      Boolean(
        destinationLot
      ) &&
      Math.abs(
        destinationLot.soldOrUsed
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverNotTransferredToStorage:
      Boolean(
        destinationLot
      ) &&
      Math.abs(
        destinationLot.transferredToStorage
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    receiverNotWrittenOff:
      Boolean(
        destinationLot
      ) &&
      Math.abs(
        destinationLot.writtenOff
      ) <=
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance,

    sourceMovementIsTransferOut:
      interbranchCleanupHasMovementType_(
        sourceMovements,
        'Передача у філію'
      ),

    receiverHasWaitingMovement:
      interbranchCleanupHasMovementType_(
        destinationMovements,
        'Очікування приймання'
      ),

    receiverHasAcceptanceMovement:
      interbranchCleanupHasMovementType_(
        destinationMovements,
        'Прийняття з філії'
      ),

    sourceJournalAccepted:
      Boolean(
        sourceJournalValues
      ) &&
      interbranchCleanupEquals_(
        sourceJournalValues[13],
        config.expectedStatus
      ),

    destinationJournalAccepted:
      Boolean(
        destinationJournalValues
      ) &&
      interbranchCleanupEquals_(
        destinationJournalValues[13],
        config.expectedStatus
      )
  };

  const safeToCancel =
    Object
      .keys(
        checks
      )
      .every(
        function(key) {
          return (
            checks[key] === true
          );
        }
      );

  const result = {
    ok:
      safeToCancel,

    test:
      'auditCompletedInterbranchTestTransferForCancellation',

    version:
      config.version,

    transferId:
      config.transferId,

    sourceBranch:
      config.sourceBranch,

    destinationBranch:
      config.destinationBranch,

    sourceStockRows:
      sourceStockRows,

    destinationStockRows:
      destinationStockRows,

    sourceJournalRows:
      sourceJournalRows,

    destinationJournalRows:
      destinationJournalRows,

    sourceMovements:
      sourceMovements,

    destinationMovements:
      destinationMovements,

    checks:
      checks,

    safeToCancel:
      safeToCancel,

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

  SpreadsheetApp
    .getActive()
    .toast(
      safeToCancel
        ? (
            'Сухий аудит пройдено. ' +
            'Тестове переміщення готове до контрольованого очищення.'
          )
        : (
            'Очищення заблоковано. ' +
            'Один або кілька контрольних пунктів не пройдено.'
          ),
      'Очищення тестового переміщення',
      10
    );

  if (!safeToCancel) {
    throw new Error(
      'Тестове переміщення поки не можна безпечно очистити. ' +
      'Перевірте checks у журналі виконання.'
    );
  }

  return result;
}
/****************************************************
 * PROFIN OS — КОНТРОЛЬОВАНЕ ОЧИЩЕННЯ
 * ЗАВЕРШЕНОГО ТЕСТОВОГО ПЕРЕМІЩЕННЯ
 *
 * ЕТАП B:
 * — тест повного відкату;
 * — реальне одноразове очищення.
 *
 * ДОДАТИ НИЖЧЕ КОДУ ЕТАПУ A
 * у inventoryTransferTestCleanup.gs
 ****************************************************/

const INTERBRANCH_TEST_CLEANUP_EXECUTION_CONFIG = Object.freeze({
  version: '1.0',
  lockTimeoutMs: 30000
});


function getCompletedInterbranchCleanupContext_() {
  const audit =
    auditCompletedInterbranchTestTransferForCancellation();

  const config =
    INTERBRANCH_TEST_CLEANUP_CONFIG;

  const sourceConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[config.sourceBranch];

  const destinationConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[config.destinationBranch];

  const sourceSpreadsheet =
    SpreadsheetApp.openById(
      sourceConfig.spreadsheetId
    );

  const destinationSpreadsheet =
    SpreadsheetApp.openById(
      destinationConfig.spreadsheetId
    );

  const names =
    INTERBRANCH_TRANSFER_CONFIG
      .sheetNames;

  return {
    audit: audit,
    config: config,

    sourceSpreadsheet:
      sourceSpreadsheet,

    destinationSpreadsheet:
      destinationSpreadsheet,

    sourceStockSheet:
      sourceSpreadsheet.getSheetByName(
        names.stock
      ),

    sourceMovementSheet:
      sourceSpreadsheet.getSheetByName(
        names.movement
      ),

    sourceJournalSheet:
      sourceSpreadsheet.getSheetByName(
        names.transferJournal
      ),

    destinationStockSheet:
      destinationSpreadsheet.getSheetByName(
        names.stock
      ),

    destinationMovementSheet:
      destinationSpreadsheet.getSheetByName(
        names.movement
      ),

    destinationJournalSheet:
      destinationSpreadsheet.getSheetByName(
        names.transferJournal
      ),

    sourceStockRow:
      audit.sourceStockRows[0],

    destinationStockRow:
      audit.destinationStockRows[0],

    sourceJournalRow:
      audit.sourceJournalRows[0],

    destinationJournalRow:
      audit.destinationJournalRows[0],

    sourceMovementRows:
      audit.sourceMovements.map(
        function(item) {
          return item.row;
        }
      ),

    destinationMovementRows:
      audit.destinationMovements.map(
        function(item) {
          return item.row;
        }
      )
  };
}


function captureInterbranchCleanupRow_(
  sheet,
  row,
  columnCount
) {
  const range =
    sheet.getRange(
      row,
      1,
      1,
      columnCount
    );

  return {
    row:
      row,

    columnCount:
      columnCount,

    values:
      range.getValues()[0],

    backgrounds:
      range.getBackgrounds()[0],

    fontColors:
      range.getFontColors()[0],

    fontWeights:
      range.getFontWeights()[0],

    numberFormats:
      range.getNumberFormats()[0],

    horizontalAlignments:
      range.getHorizontalAlignments()[0],

    validations:
      range.getDataValidations()[0]
  };
}


function applyInterbranchCleanupRowSnapshot_(
  sheet,
  snapshot
) {
  const range =
    sheet.getRange(
      snapshot.row,
      1,
      1,
      snapshot.columnCount
    );

  range.setValues([
    snapshot.values
  ]);

  range.setBackgrounds([
    snapshot.backgrounds
  ]);

  range.setFontColors([
    snapshot.fontColors
  ]);

  range.setFontWeights([
    snapshot.fontWeights
  ]);

  range.setNumberFormats([
    snapshot.numberFormats
  ]);

  range.setHorizontalAlignments([
    snapshot.horizontalAlignments
  ]);

  range.setDataValidations([
    snapshot.validations
  ]);
}


function restoreDeletedInterbranchCleanupRow_(
  sheet,
  snapshot
) {
  sheet.insertRowsBefore(
    snapshot.row,
    1
  );

  applyInterbranchCleanupRowSnapshot_(
    sheet,
    snapshot
  );
}


function captureCompletedInterbranchCleanupSnapshots_(
  context
) {
  const stockCols =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumnCount;

  const movementCols =
    context.config
      .movementColumnCount;

  const journalCols =
    context.config
      .journalColumnCount;

  return {
    sourceStock:
      captureInterbranchCleanupRow_(
        context.sourceStockSheet,
        context.sourceStockRow,
        stockCols
      ),

    destinationStock:
      captureInterbranchCleanupRow_(
        context.destinationStockSheet,
        context.destinationStockRow,
        stockCols
      ),

    sourceMovements:
      context.sourceMovementRows.map(
        function(row) {
          return captureInterbranchCleanupRow_(
            context.sourceMovementSheet,
            row,
            movementCols
          );
        }
      ),

    destinationMovements:
      context.destinationMovementRows.map(
        function(row) {
          return captureInterbranchCleanupRow_(
            context.destinationMovementSheet,
            row,
            movementCols
          );
        }
      ),

    sourceJournal:
      captureInterbranchCleanupRow_(
        context.sourceJournalSheet,
        context.sourceJournalRow,
        journalCols
      ),

    destinationJournal:
      captureInterbranchCleanupRow_(
        context.destinationJournalSheet,
        context.destinationJournalRow,
        journalCols
      )
  };
}


function resolveInterbranchCleanupSourceStatus_(
  balance,
  minimumStock
) {
  const actualBalance =
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
    actualBalance <= tolerance
  ) {
    return 'Закрита';
  }

  if (
    minimum > 0 &&
    actualBalance <= minimum
  ) {
    return 'Низький залишок';
  }

  return 'Активна';
}


function buildCancelledTestSourceStockRow_(
  context,
  sourceStockValues
) {
  const values =
    sourceStockValues.slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const restoredBalance =
    interbranchPlannerNumber_(
      values[
        columns.currentBalance
      ]
    ) +
    context.config.quantity;

  const restoredTransferred =
    Math.max(
      0,
      interbranchPlannerNumber_(
        values[
          columns.transferredToBranches
        ]
      ) -
      context.config.quantity
    );

  values[
    columns.currentBalance
  ] =
    restoredBalance;

  values[
    columns.lotStatus
  ] =
    resolveInterbranchCleanupSourceStatus_(
      restoredBalance,
      values[
        columns.minimumStock
      ]
    );

  values[
    columns.transferId
  ] = '';

  values[
    columns.sourceBranch
  ] = '';

  values[
    columns.destinationBranch
  ] = '';

  values[
    columns.transferQuantity
  ] = '';

  values[
    columns.transferStatus
  ] = '';

  values[
    columns.transferAction
  ] = '';

  values[
    columns.transferDateTime
  ] = '';

  values[
    columns.transferUser
  ] = '';

  values[
    columns.transferredToBranches
  ] =
    restoredTransferred;

  return values;
}


function maybeForceCompletedInterbranchCleanupFailure_(
  point,
  options
) {
  if (
    options &&
    options.forceFailureAt === point
  ) {
    throw new Error(
      'ТЕСТОВА ПОМИЛКА ОЧИЩЕННЯ: ' +
      point
    );
  }
}


function deleteInterbranchCleanupSnapshotsDescending_(
  sheet,
  snapshots,
  deletedSnapshots
) {
  snapshots
    .slice()
    .sort(
      function(first, second) {
        return (
          second.row -
          first.row
        );
      }
    )
    .forEach(
      function(snapshot) {
        sheet.deleteRow(
          snapshot.row
        );

        deletedSnapshots.push(
          snapshot
        );
      }
    );
}


function restoreInterbranchCleanupSnapshots_(
  transaction
) {
  const errors = [];

  const context =
    transaction.context;

  const snapshots =
    transaction.snapshots;

  function safeRestore(
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

  if (
    transaction
      .destinationJournalDeleted
  ) {
    safeRestore(
      function() {
        restoreDeletedInterbranchCleanupRow_(
          context.destinationJournalSheet,
          snapshots.destinationJournal
        );
      }
    );
  }

  if (
    transaction
      .sourceJournalDeleted
  ) {
    safeRestore(
      function() {
        restoreDeletedInterbranchCleanupRow_(
          context.sourceJournalSheet,
          snapshots.sourceJournal
        );
      }
    );
  }

  transaction
    .deletedDestinationMovementSnapshots
    .slice()
    .sort(
      function(first, second) {
        return (
          first.row -
          second.row
        );
      }
    )
    .forEach(
      function(snapshot) {
        safeRestore(
          function() {
            restoreDeletedInterbranchCleanupRow_(
              context.destinationMovementSheet,
              snapshot
            );
          }
        );
      }
    );

  transaction
    .deletedSourceMovementSnapshots
    .slice()
    .sort(
      function(first, second) {
        return (
          first.row -
          second.row
        );
      }
    )
    .forEach(
      function(snapshot) {
        safeRestore(
          function() {
            restoreDeletedInterbranchCleanupRow_(
              context.sourceMovementSheet,
              snapshot
            );
          }
        );
      }
    );

  if (
    transaction
      .destinationStockDeleted
  ) {
    safeRestore(
      function() {
        restoreDeletedInterbranchCleanupRow_(
          context.destinationStockSheet,
          snapshots.destinationStock
        );
      }
    );
  }

  if (
    transaction
      .sourceStockChanged
  ) {
    safeRestore(
      function() {
        applyInterbranchCleanupRowSnapshot_(
          context.sourceStockSheet,
          snapshots.sourceStock
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


function verifyCompletedInterbranchTestTransferCleanup_(
  context
) {
  const config =
    context.config;

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const tolerance =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance;

  const sourceLot =
    getInterbranchTransferSourceLot_(
      context.sourceStockSheet,
      context.sourceStockRow
    );

  const sourceStockTransferRows =
    findInterbranchCleanupRows_(
      context.sourceStockSheet,
      columns.transferId + 1,
      config.transferId
    );

  const destinationStockTransferRows =
    findInterbranchCleanupRows_(
      context.destinationStockSheet,
      columns.transferId + 1,
      config.transferId
    );

  const sourceJournalRows =
    findInterbranchCleanupRows_(
      context.sourceJournalSheet,
      1,
      config.transferId
    );

  const destinationJournalRows =
    findInterbranchCleanupRows_(
      context.destinationJournalSheet,
      1,
      config.transferId
    );

  const sourceMovements =
    getInterbranchCleanupMovements_(
      context.sourceMovementSheet,
      config.transferId
    );

  const destinationMovements =
    getInterbranchCleanupMovements_(
      context.destinationMovementSheet,
      config.transferId
    );

  const checks = {
    sourceBalanceRestored:
      Math.abs(
        sourceLot.currentBalance -
        (
          config.expectedSourceBalance +
          config.quantity
        )
      ) <= tolerance,

    sourceTransferredCounterRestored:
      Math.abs(
        sourceLot.transferredToBranches -
        Math.max(
          0,
          config.expectedSourceTransferred -
          config.quantity
        )
      ) <= tolerance,

    sourceTransferIdCleared:
      !sourceLot.currentTransferId,

    sourceTransferStatusCleared:
      !sourceLot.currentTransferStatus,

    receiverStockRemoved:
      destinationStockTransferRows
        .length === 0,

    sourceJournalRemoved:
      sourceJournalRows.length === 0,

    destinationJournalRemoved:
      destinationJournalRows
        .length === 0,

    sourceMovementRemoved:
      sourceMovements.length === 0,

    destinationMovementsRemoved:
      destinationMovements
        .length === 0,

    noSourceTransferRowById:
      sourceStockTransferRows
        .length === 0
  };

  return {
    ok:
      Object
        .keys(
          checks
        )
        .every(
          function(key) {
            return (
              checks[key] === true
            );
          }
        ),

    checks:
      checks,

    sourceBalance:
      sourceLot.currentBalance,

    sourceTransferredToBranches:
      sourceLot
        .transferredToBranches
  };
}


function executeCompletedInterbranchTestTransferCleanupCore_(
  options
) {
  const lock =
    LockService.getScriptLock();

  let lockAcquired =
    false;

  const transaction = {
    context:
      null,

    snapshots:
      null,

    sourceStockChanged:
      false,

    destinationStockDeleted:
      false,

    deletedSourceMovementSnapshots:
      [],

    deletedDestinationMovementSnapshots:
      [],

    sourceJournalDeleted:
      false,

    destinationJournalDeleted:
      false
  };

  try {
    lock.waitLock(
      INTERBRANCH_TEST_CLEANUP_EXECUTION_CONFIG
        .lockTimeoutMs
    );

    lockAcquired =
      true;

    const context =
      getCompletedInterbranchCleanupContext_();

    transaction.context =
      context;

    transaction.snapshots =
      captureCompletedInterbranchCleanupSnapshots_(
        context
      );

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
        buildCancelledTestSourceStockRow_(
          context,
          transaction
            .snapshots
            .sourceStock
            .values
        )
      ]);

    transaction.sourceStockChanged =
      true;

    maybeForceCompletedInterbranchCleanupFailure_(
      'afterSourceStockRestore',
      options
    );

    context
      .destinationStockSheet
      .deleteRow(
        context.destinationStockRow
      );

    transaction.destinationStockDeleted =
      true;

    maybeForceCompletedInterbranchCleanupFailure_(
      'afterDestinationStockDelete',
      options
    );

    deleteInterbranchCleanupSnapshotsDescending_(
      context.sourceMovementSheet,
      transaction
        .snapshots
        .sourceMovements,
      transaction
        .deletedSourceMovementSnapshots
    );

    deleteInterbranchCleanupSnapshotsDescending_(
      context.destinationMovementSheet,
      transaction
        .snapshots
        .destinationMovements,
      transaction
        .deletedDestinationMovementSnapshots
    );

    maybeForceCompletedInterbranchCleanupFailure_(
      'afterMovementDeletes',
      options
    );

    context
      .sourceJournalSheet
      .deleteRow(
        context.sourceJournalRow
      );

    transaction.sourceJournalDeleted =
      true;

    context
      .destinationJournalSheet
      .deleteRow(
        context.destinationJournalRow
      );

    transaction.destinationJournalDeleted =
      true;

    SpreadsheetApp.flush();

    maybeForceCompletedInterbranchCleanupFailure_(
      'afterAllWrites',
      options
    );

    const verification =
      verifyCompletedInterbranchTestTransferCleanup_(
        context
      );

    if (!verification.ok) {
      throw new Error(
        'Контрольна перевірка очищення не пройдена: ' +
        JSON.stringify(
          verification.checks
        )
      );
    }

    return {
      ok:
        true,

      transferId:
        context.config.transferId,

      sourceBranch:
        context.config.sourceBranch,

      destinationBranch:
        context.config
          .destinationBranch,

      verification:
        verification,

      rolledBack:
        false
    };

  } catch (error) {
    const rollback =
      transaction.context &&
      transaction.snapshots
        ? restoreInterbranchCleanupSnapshots_(
            transaction
          )
        : {
            ok:
              true,

            errors:
              []
          };

    if (!rollback.ok) {
      throw new Error(
        'КРИТИЧНА ПОМИЛКА. Очищення не вдалося повністю відкотити.\n\n' +
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
      'Очищення скасовано і повністю відкочено.\n\n' +
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
 * ДЕТАЛЬНИЙ ЗНІМОК СТАНУ ДЛЯ ТЕСТУ ВІДКАТУ
 ****************************************************/

function buildCompletedInterbranchCleanupStateObject_() {
  const context =
    getCompletedInterbranchCleanupContext_();

  const snapshots =
    captureCompletedInterbranchCleanupSnapshots_(
      context
    );

  return {
    sourceStock:
      snapshots.sourceStock.values,

    destinationStock:
      snapshots.destinationStock.values,

    sourceMovements:
      snapshots.sourceMovements.map(
        function(item) {
          return item.values;
        }
      ),

    destinationMovements:
      snapshots.destinationMovements.map(
        function(item) {
          return item.values;
        }
      ),

    sourceJournal:
      snapshots.sourceJournal.values,

    destinationJournal:
      snapshots.destinationJournal.values
  };
}


/****************************************************
 * ПОРІВНЯННЯ ОКРЕМИХ БЛОКІВ
 ****************************************************/

function compareCompletedInterbranchCleanupStates_(
  beforeState,
  afterState
) {
  const keys = [
    'sourceStock',
    'destinationStock',
    'sourceMovements',
    'destinationMovements',
    'sourceJournal',
    'destinationJournal'
  ];

  const sections = {};
  const differences = {};

  keys.forEach(
    function(key) {
      const beforeJson =
        JSON.stringify(
          beforeState[key]
        );

      const afterJson =
        JSON.stringify(
          afterState[key]
        );

      const equal =
        beforeJson ===
        afterJson;

      sections[key] =
        equal;

      if (!equal) {
        differences[key] = {
          before:
            beforeState[key],

          after:
            afterState[key]
        };
      }
    }
  );

  const exactStateRestored =
    keys.every(
      function(key) {
        return (
          sections[key] ===
          true
        );
      }
    );

  return {
    exactStateRestored:
      exactStateRestored,

    sections:
      sections,

    differences:
      differences
  };
}


/****************************************************
 * ОНОВЛЕНИЙ ТЕСТ КОНТРОЛЬОВАНОГО ВІДКАТУ
 ****************************************************/

function testCompletedInterbranchTestTransferCleanupRollback() {
  const beforeState =
    buildCompletedInterbranchCleanupStateObject_();

  let expectedFailureOccurred =
    false;

  let failureMessage =
    '';

  try {
    executeCompletedInterbranchTestTransferCleanupCore_({
      forceFailureAt:
        'afterAllWrites'
    });

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
    buildCompletedInterbranchCleanupStateObject_();

  const comparison =
    compareCompletedInterbranchCleanupStates_(
      beforeState,
      afterState
    );

  const auditResult =
    auditCompletedInterbranchTestTransferForCancellation();

  const checks = {
    expectedFailureOccurred:
      expectedFailureOccurred,

    sourceStockRestored:
      comparison
        .sections
        .sourceStock,

    destinationStockRestored:
      comparison
        .sections
        .destinationStock,

    sourceMovementsRestored:
      comparison
        .sections
        .sourceMovements,

    destinationMovementsRestored:
      comparison
        .sections
        .destinationMovements,

    sourceJournalRestored:
      comparison
        .sections
        .sourceJournal,

    destinationJournalRestored:
      comparison
        .sections
        .destinationJournal,

    exactStateRestored:
      comparison
        .exactStateRestored,

    auditStillPasses:
      auditResult.safeToCancel ===
      true
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
      'testCompletedInterbranchTestTransferCleanupRollback',

    version:
      INTERBRANCH_TEST_CLEANUP_EXECUTION_CONFIG
        .version,

    transferId:
      INTERBRANCH_TEST_CLEANUP_CONFIG
        .transferId,

    expectedFailureMessage:
      failureMessage,

    checks:
      checks,

    differences:
      comparison.differences,

    noChangesRemain:
      comparison
        .exactStateRestored
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
            'Відкат очищення пройдено. ' +
            'Тестове переміщення залишилося без змін.'
          )
        : (
            'Знайдено відмінність після відкату. ' +
            'Перевірте блок differences.'
          ),
      'Очищення тестового переміщення',
      10
    );

  if (!ok) {
    throw new Error(
      'Тест контрольованого відкату очищення не пройдено. ' +
      'Точні відмінності записані в differences.'
    );
  }

  return result;
}


function executeCompletedInterbranchTestTransferCleanup() {
  const result =
    executeCompletedInterbranchTestTransferCleanupCore_(
      {}
    );

  SpreadsheetApp
    .getActive()
    .toast(
      'Тестове переміщення повністю очищено. ' +
      'Альтернатива: залишок 6, передано у філії 0.',
      'Очищення тестового переміщення',
      10
    );

  return result;
}
/**
 * READ-ONLY.
 * Перевіряє, чи є SET для наявної завершеної тестової передачі.
 */
function auditCompletedTestTransferSettlements() {
  const config =
    INTERBRANCH_TEST_CLEANUP_CONFIG;

  const settlementId =
    'SET-' + config.transferId;

  const sourceConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[config.sourceBranch];

  const destinationConfig =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[config.destinationBranch];

  const sourceSpreadsheet =
    SpreadsheetApp.openById(
      sourceConfig.spreadsheetId
    );

  const destinationSpreadsheet =
    SpreadsheetApp.openById(
      destinationConfig.spreadsheetId
    );

  const sheetName =
    INTERBRANCH_SETTLEMENTS_CONFIG
      .settlementSheetName;

  function readSettlement_(spreadsheet) {
    const sheet =
      spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error(
        'Не знайдено лист «' + sheetName + '».'
      );
    }

    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return [];
    }

    const headers = values[0];
    const idIndex = headers.indexOf('ID розрахунку');

    if (idIndex === -1) {
      throw new Error(
        'Не знайдено колонку «ID розрахунку».'
      );
    }

    return values
      .slice(1)
      .map(function(row, index) {
        return {
          rowNumber: index + 2,
          row: row
        };
      })
      .filter(function(item) {
        return (
          String(item.row[idIndex] || '').trim() ===
          settlementId
        );
      });
  }

  const alternativeRows =
    readSettlement_(sourceSpreadsheet);

  const baburkaRows =
    readSettlement_(destinationSpreadsheet);

  const result = {
    ok: true,
    test: 'auditCompletedTestTransferSettlements',
    writesNow: false,
    transferId: config.transferId,
    settlementId: settlementId,
    alternativeSettlementRows:
      alternativeRows.length,
    baburkaSettlementRows:
      baburkaRows.length,
    readyForSetAwareCleanup:
      alternativeRows.length === 1 &&
      baburkaRows.length === 1
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
function auditAcceptedTestTransfer_20260824() {
  const transferId =
    'TRF-ALT-BAB-20260824-171809-A9324D';

  const settlementId =
    'SET-' + transferId;

  const sourceName = 'Альтернатива';
  const destinationName = 'Бабурка';

  function text_(value) {
    return String(value || '').trim();
  }

  function getBranchSpreadsheet_(branchName) {
    const branch =
      INTERBRANCH_TRANSFER_CONFIG
        .branches[branchName];

    if (!branch || !branch.spreadsheetId) {
      throw new Error(
        'Не знайдено конфігурацію філії: ' +
        branchName
      );
    }

    return SpreadsheetApp.openById(
      branch.spreadsheetId
    );
  }

  function read_(spreadsheet, sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error(
        'Не знайдено лист «' +
        sheetName +
        '» у файлі «' +
        spreadsheet.getName() +
        '».'
      );
    }

    const values = sheet.getDataRange().getValues();

    return {
      sheet: sheet,
      headers: values.shift(),
      rows: values
    };
  }

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index;
  }

  function exactRows_(rows, column, value) {
    return rows.filter(function(row) {
      return text_(row[column]) === value;
    });
  }

  function idsByPrefix_(rows, column, prefix) {
    return rows
      .filter(function(row) {
        return text_(row[column]).indexOf(prefix) === 0;
      })
      .map(function(row) {
        return text_(row[column]);
      });
  }

  const sourceSs =
    getBranchSpreadsheet_(sourceName);

  const destinationSs =
    getBranchSpreadsheet_(destinationName);

  const names =
    INTERBRANCH_TRANSFER_CONFIG.sheetNames;

  const sourceStock = read_(sourceSs, names.stock);
  const destinationStock = read_(
    destinationSs,
    names.stock
  );

  const sourceMovement = read_(
    sourceSs,
    names.movement
  );

  const destinationMovement = read_(
    destinationSs,
    names.movement
  );

  const sourceJournal = read_(
    sourceSs,
    names.transferJournal
  );

  const destinationJournal = read_(
    destinationSs,
    names.transferJournal
  );

  const sourceSettlement = read_(
    sourceSs,
    'Взаєморозрахунки філій'
  );

  const destinationSettlement = read_(
    destinationSs,
    'Взаєморозрахунки філій'
  );

  const sourceStockTransfer =
    column_(sourceStock.headers, 'ID переміщення');

  const destinationStockTransfer =
    column_(
      destinationStock.headers,
      'ID переміщення'
    );

  const sourceMovementId =
    column_(sourceMovement.headers, 'ID руху');

  const destinationMovementId =
    column_(
      destinationMovement.headers,
      'ID руху'
    );

  const sourceJournalId =
    column_(
      sourceJournal.headers,
      'ID переміщення'
    );

  const destinationJournalId =
    column_(
      destinationJournal.headers,
      'ID переміщення'
    );

  const sourceSettlementId =
    column_(
      sourceSettlement.headers,
      'ID розрахунку'
    );

  const destinationSettlementId =
    column_(
      destinationSettlement.headers,
      'ID розрахунку'
    );

  const result = {
    ok: true,
    test: 'auditAcceptedTestTransfer_20260824',
    writesNow: false,
    transferId: transferId,
    settlementId: settlementId,

    sourceStockRows: exactRows_(
      sourceStock.rows,
      sourceStockTransfer,
      transferId
    ).length,

    destinationStockRows: exactRows_(
      destinationStock.rows,
      destinationStockTransfer,
      transferId
    ).length,

    sourceMovementIds: idsByPrefix_(
      sourceMovement.rows,
      sourceMovementId,
      transferId + '-'
    ),

    destinationMovementIds: idsByPrefix_(
      destinationMovement.rows,
      destinationMovementId,
      transferId + '-'
    ),

    sourceJournalRows: exactRows_(
      sourceJournal.rows,
      sourceJournalId,
      transferId
    ).length,

    destinationJournalRows: exactRows_(
      destinationJournal.rows,
      destinationJournalId,
      transferId
    ).length,

    alternativeSettlementRows: exactRows_(
      sourceSettlement.rows,
      sourceSettlementId,
      settlementId
    ).length,

    baburkaSettlementRows: exactRows_(
      destinationSettlement.rows,
      destinationSettlementId,
      settlementId
    ).length
  };

  result.readyForSetAwareCleanup =
    result.sourceStockRows === 1 &&
    result.destinationStockRows === 1 &&
    result.sourceMovementIds.length === 1 &&
    result.destinationMovementIds.length === 2 &&
    result.sourceJournalRows === 1 &&
    result.destinationJournalRows === 1 &&
    result.alternativeSettlementRows === 1 &&
    result.baburkaSettlementRows === 1;

  console.log(JSON.stringify(result, null, 2));
  return result;
}
function previewSetAwareTestTransferCleanup_20260824() {
  const transferId =
    'TRF-ALT-BAB-20260824-171809-A9324D';

  const settlementId =
    'SET-' + transferId;

  const sourceName = 'Альтернатива';
  const destinationName = 'Бабурка';

  function text_(value) {
    return String(value || '').trim();
  }

  function number_(value) {
    return Number(value) || 0;
  }

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index;
  }

  function branchSs_(branchName) {
    const branch =
      INTERBRANCH_TRANSFER_CONFIG.branches[branchName];

    if (!branch || !branch.spreadsheetId) {
      throw new Error(
        'Не знайдено конфігурацію філії: ' +
        branchName
      );
    }

    return SpreadsheetApp.openById(branch.spreadsheetId);
  }

  function data_(spreadsheet, sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error('Не знайдено лист: ' + sheetName);
    }

    const values = sheet.getDataRange().getValues();

    return {
      sheet: sheet,
      headers: values.shift(),
      rows: values
    };
  }

  function findExact_(rows, column, value) {
    return rows.filter(function(row) {
      return text_(row[column]) === value;
    });
  }

  const sourceSs = branchSs_(sourceName);
  const destinationSs = branchSs_(destinationName);
  const names = INTERBRANCH_TRANSFER_CONFIG.sheetNames;

  const sourceStock = data_(sourceSs, names.stock);
  const destinationStock = data_(
    destinationSs,
    names.stock
  );

  const sourceSettlement = data_(
    sourceSs,
    'Взаєморозрахунки філій'
  );

  const destinationSettlement = data_(
    destinationSs,
    'Взаєморозрахунки філій'
  );

  const sTransferId = column_(
    sourceStock.headers,
    'ID переміщення'
  );

  const dTransferId = column_(
    destinationStock.headers,
    'ID переміщення'
  );

  const dBalance = column_(
    destinationStock.headers,
    'Поточний залишок'
  );

  const dSold = column_(
    destinationStock.headers,
    'Продано / використано'
  );

  const dStorage = column_(
    destinationStock.headers,
    'Передано на зберігання'
  );

  const dWrittenOff = column_(
    destinationStock.headers,
    'Списано'
  );

  const dStatus = column_(
    destinationStock.headers,
    'Статус переміщення'
  );

  const setId = column_(
    sourceSettlement.headers,
    'ID розрахунку'
  );

  const setAmount = column_(
    sourceSettlement.headers,
    'Сума нарахування'
  );

  const sourceLotRows = findExact_(
    sourceStock.rows,
    sTransferId,
    transferId
  );

  const destinationLotRows = findExact_(
    destinationStock.rows,
    dTransferId,
    transferId
  );

  const alternativeSetRows = findExact_(
    sourceSettlement.rows,
    setId,
    settlementId
  );

  const baburkaSetRows = findExact_(
    destinationSettlement.rows,
    setId,
    settlementId
  );

  const destinationLot =
    destinationLotRows.length === 1
      ? destinationLotRows[0]
      : null;

  const actor =
    Session.getActiveUser().getEmail() ||
    'невідомий користувач';

  const checks = {
    sourceLotFoundOnce: sourceLotRows.length === 1,
    destinationLotFoundOnce:
      destinationLotRows.length === 1,

    destinationIsAccepted:
      Boolean(destinationLot) &&
      text_(destinationLot[dStatus]) === 'Прийнято',

    destinationBalanceIsOne:
      Boolean(destinationLot) &&
      number_(destinationLot[dBalance]) === 1,

    destinationNotUsed:
      Boolean(destinationLot) &&
      number_(destinationLot[dSold]) === 0,

    destinationNotStored:
      Boolean(destinationLot) &&
      number_(destinationLot[dStorage]) === 0,

    destinationNotWrittenOff:
      Boolean(destinationLot) &&
      number_(destinationLot[dWrittenOff]) === 0,

    alternativeSettlementOnce:
      alternativeSetRows.length === 1,

    baburkaSettlementOnce:
      baburkaSetRows.length === 1,

    alternativeSettlementAmountIs60:
      alternativeSetRows.length === 1 &&
      number_(alternativeSetRows[0][setAmount]) === 60,

    baburkaSettlementAmountIs60:
      baburkaSetRows.length === 1 &&
      number_(baburkaSetRows[0][setAmount]) === 60
  };

  const readyForCleanup = Object.keys(checks)
    .every(function(key) {
      return checks[key] === true;
    });

  const result = {
    ok: true,
    test: 'previewSetAwareTestTransferCleanup_20260824',
    writesNow: false,
    transferId: transferId,
    settlementId: settlementId,
    readyForCleanup: readyForCleanup,
    checks: checks,
    proposedActions: readyForCleanup
      ? [
          'RESTORE_SOURCE_BALANCE_AND_COUNTER',
          'RESTORE_TRANSFER_DROPDOWN_ONLY_IF_LOT_IS_NOT_CLOSED',
          'REMOVE_RECEIVER_LOT_AND_THREE_MOVEMENTS',
          'REMOVE_TWO_SETTLEMENT_ROWS',
          'KEEP_TWO_TRANSFER_JOURNAL_ROWS_AS_AUDIT_TRACE',
          'MARK_JOURNALS_AS_RETURNED_WITH_DATE_USER_AND_COMMENT'
        ]
      : [],
    auditMark: {
      status: 'Повернуто',
      actor: actor,
      timestampWillBeSetOnExecution: true,
      comment:
        'Тестове переміщення очищено контрольованим сценарієм. ' +
        'Складські рухи та взаєморозрахунки відкочено.'
    }
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}