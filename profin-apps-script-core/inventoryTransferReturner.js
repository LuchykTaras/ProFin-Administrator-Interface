/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПОВЕРНЕННЯ
 *
 * КРОК 7.2 — СУХИЙ АУДИТ ПОВЕРНЕННЯ
 *
 * СЦЕНАРІЙ:
 * Передача
 * → Очікує приймання
 * → Повернути
 *
 * ЦЯ ВЕРСІЯ:
 * — нічого не змінює;
 * — нічого не видаляє;
 * — не створює рухів;
 * — перевіряє узгодженість двох філій;
 * — підтверджує готовність до повернення.
 ****************************************************/


const INTERBRANCH_TRANSFER_RETURN_CONFIG =
  Object.freeze({

    version:
      '1.0',

    expectedAction:
      'Повернути',

    movementColumnCount:
      12,

    journalColumnCount:
      20,

    statuses:
      Object.freeze({

        sourcePending:
          'Передано — очікує приймання',

        receiverPending:
          'Очікує приймання'
      }),

    lotStatuses:
      Object.freeze({

        blocked:
          'Заблокована'
      }),

    movementTypes:
      Object.freeze({

        sourceTransfer:
          'Передача у філію',

        receiverPending:
          'Очікування приймання',

        receiverAccepted:
          'Прийняття з філії'
      })
  });


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assertInterbranchReturnDependencies_() {
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
    typeof getInterbranchReceiverContextByRow_ !==
    'function'
  ) {
    missing.push(
      'getInterbranchReceiverContextByRow_()'
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
    typeof interbranchPlannerNumber_ !==
    'function'
  ) {
    missing.push(
      'interbranchPlannerNumber_()'
    );
  }

  if (
    typeof findInterbranchReceiverExactRow_ !==
    'function'
  ) {
    missing.push(
      'findInterbranchReceiverExactRow_()'
    );
  }

  if (missing.length > 0) {
    throw new Error(
      'Не вистачає залежностей модуля повернення:\n' +
      missing.join('\n')
    );
  }

  return true;
}


/****************************************************
 * НОРМАЛІЗОВАНЕ ПОРІВНЯННЯ
 ****************************************************/

function interbranchReturnEquals_(
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
 * ПОШУК РЯДКА ДЛЯ ПОВЕРНЕННЯ
 *
 * Спочатку перевіряється активний рядок.
 * Якщо він не підходить — шукається єдиний
 * рядок зі значенням «Повернути» у колонці Y.
 ****************************************************/

function getInterbranchReturnSelectedRow_() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const stockSheet =
    spreadsheet.getSheetByName(
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock
    );

  if (!stockSheet) {
    throw new Error(
      'Не знайдено лист «Склад медичних запасів».'
    );
  }

  const actionColumn =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actionColumn;

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
    const activeRow =
      activeRange.getRow();

    const activeAction =
      String(
        stockSheet
          .getRange(
            activeRow,
            actionColumn
          )
          .getDisplayValue() || ''
      ).trim();

    if (
      interbranchReturnEquals_(
        activeAction,
        INTERBRANCH_TRANSFER_RETURN_CONFIG
          .expectedAction
      )
    ) {
      return activeRow;
    }
  }

  const lastRow =
    stockSheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'На складі немає рядків для повернення.'
    );
  }

  const actionValues =
    stockSheet
      .getRange(
        2,
        actionColumn,
        lastRow - 1,
        1
      )
      .getDisplayValues();

  const matchingRows = [];

  actionValues.forEach(
    function(
      rowValues,
      index
    ) {
      const action =
        String(
          rowValues[0] || ''
        ).trim();

      if (
        interbranchReturnEquals_(
          action,
          INTERBRANCH_TRANSFER_RETURN_CONFIG
            .expectedAction
        )
      ) {
        matchingRows.push(
          index + 2
        );
      }
    }
  );

  if (matchingRows.length === 0) {
    throw new Error(
      'Не знайдено рядка, де у колонці Y вибрано «Повернути».'
    );
  }

  if (matchingRows.length > 1) {
    throw new Error(
      'Знайдено кілька рядків зі значенням «Повернути»: ' +
      matchingRows.join(', ') +
      '. Оберіть потрібний рядок вручну.'
    );
  }

  return matchingRows[0];
}


/****************************************************
 * ЧИТАННЯ РУХІВ ЗА ID ПЕРЕМІЩЕННЯ
 *
 * У листі «Рух складу»:
 * A — ID руху
 * B — ID операції / переміщення
 * G — тип руху
 ****************************************************/

function getInterbranchReturnMovements_(
  movementSheet,
  transferId
) {
  if (!movementSheet) {
    return [];
  }

  const lastRow =
    movementSheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const operationIds =
    movementSheet
      .getRange(
        2,
        2,
        lastRow - 1,
        1
      )
      .getDisplayValues();

  const movements = [];

  operationIds.forEach(
    function(
      rowValues,
      index
    ) {
      const operationId =
        String(
          rowValues[0] || ''
        ).trim();

      if (
        operationId !==
        transferId
      ) {
        return;
      }

      const row =
        index + 2;

      const values =
        movementSheet
          .getRange(
            row,
            1,
            1,
            INTERBRANCH_TRANSFER_RETURN_CONFIG
              .movementColumnCount
          )
          .getValues()[0];

      movements.push({
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

        date:
          values[2],

        inventoryType:
          String(
            values[3] || ''
          ).trim(),

        inventoryName:
          String(
            values[4] || ''
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
          ),

        user:
          String(
            values[10] || ''
          ).trim(),

        createdAt:
          values[11]
      });
    }
  );

  return movements;
}


/****************************************************
 * ПЕРЕВІРКА ТИПУ РУХУ
 ****************************************************/

function interbranchReturnHasMovementType_(
  movements,
  expectedType
) {
  return movements.some(
    function(movement) {
      return interbranchReturnEquals_(
        movement.movementType,
        expectedType
      );
    }
  );
}


/****************************************************
 * ПІДРАХУНОК РУХІВ ПЕВНОГО ТИПУ
 ****************************************************/

function countInterbranchReturnMovementType_(
  movements,
  expectedType
) {
  return movements.filter(
    function(movement) {
      return interbranchReturnEquals_(
        movement.movementType,
        expectedType
      );
    }
  ).length;
}


/****************************************************
 * СУХИЙ АУДИТ ПОВЕРНЕННЯ
 *
 * НІЧОГО НЕ ЗМІНЮЄ.
 ****************************************************/

function auditInterbranchTransferReturn() {
  assertInterbranchReturnDependencies_();

  const receiverRow =
    getInterbranchReturnSelectedRow_();

  /*
   * Використовуємо вже протестовану функцію
   * формування контексту приймання.
   *
   * Вона перевіряє:
   * — поточну філію;
   * — ID переміщення;
   * — статус очікування;
   * — заблоковану партію;
   * — нульовий прийнятий залишок;
   * — відповідність даних двох філій;
   * — наявність журналів.
   */
  const context =
    getInterbranchReceiverContextByRow_(
      receiverRow
    );

  const config =
    INTERBRANCH_TRANSFER_RETURN_CONFIG;

  const receiverAction =
    String(
      context
        .receiverLot
        .currentTransferAction || ''
    ).trim();

  const sourceMovements =
    getInterbranchReturnMovements_(
      context.sourceMovementSheet,
      context.transferId
    );

  const receiverMovements =
    getInterbranchReturnMovements_(
      context.receiverMovementSheet,
      context.transferId
    );

  const sourceJournalValues =
    context
      .sourceJournalSheet
      .getRange(
        context.sourceJournalRow,
        1,
        1,
        config.journalColumnCount
      )
      .getValues()[0];

  const receiverJournalValues =
    context
      .receiverJournalSheet
      .getRange(
        context.receiverJournalRow,
        1,
        1,
        config.journalColumnCount
      )
      .getValues()[0];

  const tolerance =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance;

  const expectedTotalCost =
    context.quantity *
    context.unitCost;

  const checks = {
    returnActionSelected:
      interbranchReturnEquals_(
        receiverAction,
        config.expectedAction
      ),

    receiverTransferPending:
      interbranchReturnEquals_(
        context
          .receiverLot
          .currentTransferStatus,
        config
          .statuses
          .receiverPending
      ),

    sourceTransferPending:
      interbranchReturnEquals_(
        context
          .sourceLot
          .currentTransferStatus,
        config
          .statuses
          .sourcePending
      ),

    receiverLotBlocked:
      interbranchReturnEquals_(
        context
          .receiverLot
          .lotStatus,
        config
          .lotStatuses
          .blocked
      ),

    receiverAcceptedQuantityIsZero:
      Math.abs(
        context
          .receiverLot
          .received
      ) <=
      tolerance,

    receiverBalanceIsZero:
      Math.abs(
        context
          .receiverLot
          .currentBalance
      ) <=
      tolerance,

    receiverSoldOrUsedIsZero:
      Math.abs(
        context
          .receiverLot
          .soldOrUsed
      ) <=
      tolerance,

    receiverTransferredToStorageIsZero:
      Math.abs(
        context
          .receiverLot
          .transferredToStorage
      ) <=
      tolerance,

    receiverWrittenOffIsZero:
      Math.abs(
        context
          .receiverLot
          .writtenOff
      ) <=
      tolerance,

    transferQuantityPositive:
      context.quantity >
      tolerance,

    sourceTransferredCounterContainsQuantity:
      context
        .sourceLot
        .transferredToBranches >=
      context.quantity,

    sourceMovementCountCorrect:
      sourceMovements.length ===
      1,

    receiverMovementCountCorrect:
      receiverMovements.length ===
      1,

    sourceHasTransferMovement:
      countInterbranchReturnMovementType_(
        sourceMovements,
        config
          .movementTypes
          .sourceTransfer
      ) ===
      1,

    receiverHasPendingMovement:
      countInterbranchReturnMovementType_(
        receiverMovements,
        config
          .movementTypes
          .receiverPending
      ) ===
      1,

    receiverHasNoAcceptanceMovement:
      !interbranchReturnHasMovementType_(
        receiverMovements,
        config
          .movementTypes
          .receiverAccepted
      ),

    sourceMovementQuantityCorrect:
      sourceMovements.length === 1 &&
      Math.abs(
        sourceMovements[0].quantity -
        context.quantity
      ) <=
      tolerance,

    receiverMovementQuantityCorrect:
      receiverMovements.length === 1 &&
      Math.abs(
        receiverMovements[0].quantity -
        context.quantity
      ) <=
      tolerance,

    sourceMovementUnitCostCorrect:
      sourceMovements.length === 1 &&
      Math.abs(
        sourceMovements[0].unitCost -
        context.unitCost
      ) <=
      0.01,

    receiverMovementUnitCostCorrect:
      receiverMovements.length === 1 &&
      Math.abs(
        receiverMovements[0].unitCost -
        context.unitCost
      ) <=
      0.01,

    sourceMovementTotalCostCorrect:
      sourceMovements.length === 1 &&
      Math.abs(
        sourceMovements[0].totalCost -
        expectedTotalCost
      ) <=
      0.01,

    receiverMovementTotalCostCorrect:
      receiverMovements.length === 1 &&
      Math.abs(
        receiverMovements[0].totalCost -
        expectedTotalCost
      ) <=
      0.01,

    sourceJournalPending:
      interbranchReturnEquals_(
        sourceJournalValues[13],
        config
          .statuses
          .receiverPending
      ),

    receiverJournalPending:
      interbranchReturnEquals_(
        receiverJournalValues[13],
        config
          .statuses
          .receiverPending
      ),

    journalTransferIdsMatch:
      String(
        sourceJournalValues[0] || ''
      ).trim() ===
        context.transferId &&
      String(
        receiverJournalValues[0] || ''
      ).trim() ===
        context.transferId,

    journalQuantitiesMatch:
      Math.abs(
        interbranchPlannerNumber_(
          sourceJournalValues[10]
        ) -
        context.quantity
      ) <=
        tolerance &&
      Math.abs(
        interbranchPlannerNumber_(
          receiverJournalValues[10]
        ) -
        context.quantity
      ) <=
        tolerance,

    sourceAndReceiverItemsMatch:
      interbranchReturnEquals_(
        context
          .sourceLot
          .inventoryType,
        context
          .receiverLot
          .inventoryType
      ) &&
      interbranchReturnEquals_(
        context
          .sourceLot
          .inventoryName,
        context
          .receiverLot
          .inventoryName
      ) &&
      interbranchReturnEquals_(
        context
          .sourceLot
          .series,
        context
          .receiverLot
          .series
      )
  };

  const safeToReturn =
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
      safeToReturn,

    test:
      'auditInterbranchTransferReturn',

    version:
      config.version,

    transferId:
      context.transferId,

    sourceBranch:
      context.sourceBranchName,

    destinationBranch:
      context
        .receiverBranch
        .name,

    receiverRow:
      context.receiverRow,

    sourceStockRow:
      context.sourceStockRow,

    sourceJournalRow:
      context.sourceJournalRow,

    receiverJournalRow:
      context.receiverJournalRow,

    sourceLotId:
      context.sourceLot.lotId,

    receiverLotId:
      context.receiverLot.lotId,

    inventoryType:
      context
        .receiverLot
        .inventoryType,

    inventoryName:
      context
        .receiverLot
        .inventoryName,

    series:
      context
        .receiverLot
        .series,

    quantity:
      context.quantity,

    unitCost:
      context.unitCost,

    totalCost:
      expectedTotalCost,

    sourceBalanceBeforeReturn:
      context
        .sourceLot
        .currentBalance,

    sourceTransferredBeforeReturn:
      context
        .sourceLot
        .transferredToBranches,

    sourceMovements:
      sourceMovements,

    receiverMovements:
      receiverMovements,

    checks:
      checks,

    safeToReturn:
      safeToReturn,

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
      safeToReturn
        ? (
            'Сухий аудит повернення пройдено. ' +
            'Переміщення готове до контрольованого повернення.'
          )
        : (
            'Повернення заблоковано. ' +
            'Один або кілька контрольних пунктів не пройдено.'
          ),
      'Переміщення між філіями',
      10
    );

  if (!safeToReturn) {
    throw new Error(
      'Повернення поки не можна виконати безпечно. ' +
      'Перевірте checks у журналі виконання.'
    );
  }

  return result;
}
/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПОВЕРНЕННЯ
 *
 * КРОК 7.3
 * — серверна логіка повернення;
 * — повний контрольований відкат;
 * — контрольна перевірка;
 * — тест примусової помилки.
 *
 * ДОДАТИ НИЖЧЕ СУХОГО АУДИТУ
 ****************************************************/


const INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG =
  Object.freeze({

    version:
      '1.0',

    lockTimeoutMs:
      30000,

    journalColumnCount:
      20,

    statuses:
      Object.freeze({

        returned:
          'Повернуто'
      }),

    movementTypes:
      Object.freeze({

        receiverReturn:
          'Повернення відправнику',

        sourceReturn:
          'Повернення з філії'
      }),

    journalIndexes:
      Object.freeze({

        status:
          13, // N

        returnUser:
          16, // Q

        returnDateTime:
          17, // R

        action:
          19 // T
      })
  });


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ ВИКОНАННЯ
 ****************************************************/

function assertInterbranchReturnExecutionDependencies_() {
  assertInterbranchReturnDependencies_();

  const missing = [];

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

  if (
    typeof interbranchPlannerRoundMoney_ !==
    'function'
  ) {
    missing.push(
      'interbranchPlannerRoundMoney_()'
    );
  }

  if (missing.length > 0) {
    throw new Error(
      'Не вистачає залежностей виконання повернення:\n' +
      missing.join('\n')
    );
  }

  return true;
}


/****************************************************
 * СТАТУС ПАРТІЇ ВІДПРАВНИКА
 * ПІСЛЯ ПОВЕРНЕННЯ ЗАЛИШКУ
 ****************************************************/

function resolveInterbranchReturnedSourceLotStatus_(
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
    actualBalance <=
    tolerance
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


/****************************************************
 * ПІДПИС ВАЛІДАЦІЇ
 *
 * Використовується для точного порівняння
 * стану до та після тестового відкату.
 ****************************************************/

function getInterbranchReturnValidationSignature_(
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
 * ВАЛІДАЦІЯ «ПЕРЕМІСТИТИ»
 * ДЛЯ ВІДНОВЛЕНОЇ ПАРТІЇ ВІДПРАВНИКА
 ****************************************************/

function buildInterbranchReturnedSourceValidation_() {
  return SpreadsheetApp
    .newDataValidation()
    .requireValueInList(
      [
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actions
          .transfer
      ],
      true
    )
    .setAllowInvalid(
      false
    )
    .setHelpText(
      'Оберіть дозволену дію для цієї складської партії.'
    )
    .build();
}


/****************************************************
 * ФОРМАТ НОВОГО РУХУ
 *
 * Захищає нові рядки від успадкування
 * випадкового формату попереднього рядка.
 ****************************************************/

function formatInterbranchReturnMovementRow_(
  sheet,
  row
) {
  if (
    !sheet ||
    row < 2
  ) {
    return;
  }

  /*
   * C — дата руху.
   */
  sheet
    .getRange(
      row,
      3
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  /*
   * H — кількість.
   */
  sheet
    .getRange(
      row,
      8
    )
    .setNumberFormat(
      '0.##'
    );

  /*
   * I — собівартість одиниці.
   */
  sheet
    .getRange(
      row,
      9
    )
    .setNumberFormat(
      '#,##0.00'
    );

  /*
   * J — загальна собівартість.
   */
  sheet
    .getRange(
      row,
      10
    )
    .setNumberFormat(
      '#,##0.00'
    );

  /*
   * L — дата і час створення.
   */
  sheet
    .getRange(
      row,
      12
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );
}


/****************************************************
 * ПРИМУСОВА ТЕСТОВА ПОМИЛКА
 ****************************************************/

function maybeForceInterbranchReturnFailure_(
  point,
  options
) {
  if (
    options &&
    options.forceFailureAt === point
  ) {
    throw new Error(
      'ТЕСТОВА ПОМИЛКА ПОВЕРНЕННЯ: ' +
      point
    );
  }
}


/****************************************************
 * КОНТЕКСТ ВИКОНАННЯ
 *
 * Спочатку повторно запускає сухий аудит.
 ****************************************************/

function getInterbranchReturnExecutionContext_() {
  const audit =
    auditInterbranchTransferReturn();

  if (
    !audit ||
    audit.safeToReturn !== true
  ) {
    throw new Error(
      'Сухий аудит повернення не пройдено.'
    );
  }

  const context =
    getInterbranchReceiverContextByRow_(
      audit.receiverRow
    );

  return {
    audit:
      audit,

    context:
      context
  };
}


/****************************************************
 * РЯДОК СКЛАДУ ВІДПРАВНИКА
 * ПІСЛЯ ПОВЕРНЕННЯ
 ****************************************************/

function buildInterbranchReturnedSourceStockRow_(
  context
) {
  const values =
    context
      .sourceLot
      .rawValues
      .slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const restoredBalance =
    interbranchPlannerNumber_(
      context
        .sourceLot
        .currentBalance
    ) +
    context.quantity;

  const restoredTransferred =
    Math.max(
      0,
      interbranchPlannerNumber_(
        context
          .sourceLot
          .transferredToBranches
      ) -
      context.quantity
    );

  /*
   * O — доступний залишок повертається.
   */
  values[
    columns.currentBalance
  ] =
    restoredBalance;

  /*
   * Q — статус партії перераховується.
   */
  values[
    columns.lotStatus
  ] =
    resolveInterbranchReturnedSourceLotStatus_(
      restoredBalance,
      context
        .sourceLot
        .minimumStock
    );

  /*
   * X — завершальний статус переміщення.
   */
  values[
    columns.transferStatus
  ] =
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .statuses
      .returned;

  /*
   * Y — дія очищується.
   */
  values[
    columns.transferAction
  ] =
    '';

  /*
   * AB — передано у філії зменшується.
   */
  values[
    columns.transferredToBranches
  ] =
    restoredTransferred;

  return values;
}


/****************************************************
 * РЯДОК СКЛАДУ ОДЕРЖУВАЧА
 * ПІСЛЯ ПОВЕРНЕННЯ
 ****************************************************/

function buildInterbranchReturnedReceiverStockRow_(
  context
) {
  const values =
    context
      .receiverLot
      .rawValues
      .slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  /*
   * Партія не була прийнята і не стає доступною.
   */
  values[
    columns.received
  ] =
    0;

  values[
    columns.totalPurchaseCost
  ] =
    0;

  values[
    columns.currentBalance
  ] =
    0;

  values[
    columns.lotStatus
  ] =
    INTERBRANCH_TRANSFER_RETURN_CONFIG
      .lotStatuses
      .blocked;

  values[
    columns.transferStatus
  ] =
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .statuses
      .returned;

  values[
    columns.transferAction
  ] =
    '';

  return values;
}


/****************************************************
 * РЯДОК ЖУРНАЛУ ПІСЛЯ ПОВЕРНЕННЯ
 ****************************************************/

function buildInterbranchReturnedJournalRow_(
  currentValues,
  user,
  returnedAt
) {
  const values =
    currentValues.slice();

  const indexes =
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .journalIndexes;

  /*
   * N — статус.
   */
  values[
    indexes.status
  ] =
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .statuses
      .returned;

  /*
   * Q — користувач повернення.
   */
  values[
    indexes.returnUser
  ] =
    user;

  /*
   * R — дата і час повернення.
   */
  values[
    indexes.returnDateTime
  ] =
    returnedAt;

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
 * РУХ «ПОВЕРНЕННЯ ВІДПРАВНИКУ»
 * У БАБУРЦІ
 ****************************************************/

function buildInterbranchReceiverReturnMovementRow_(
  context,
  movementId,
  user,
  returnedAt
) {
  return [
    movementId,
    context.transferId,
    returnedAt,
    context.receiverLot.inventoryType,
    context.receiverLot.inventoryName,
    context.receiverLot.lotId,
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .movementTypes
      .receiverReturn,
    context.quantity,
    context.unitCost,
    context.totalCost,
    user,
    returnedAt
  ];
}


/****************************************************
 * РУХ «ПОВЕРНЕННЯ З ФІЛІЇ»
 * В АЛЬТЕРНАТИВІ
 ****************************************************/

function buildInterbranchSourceReturnMovementRow_(
  context,
  movementId,
  user,
  returnedAt
) {
  return [
    movementId,
    context.transferId,
    returnedAt,
    context.sourceLot.inventoryType,
    context.sourceLot.inventoryName,
    context.sourceLot.lotId,
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .movementTypes
      .sourceReturn,
    context.quantity,
    context.unitCost,
    context.totalCost,
    user,
    returnedAt
  ];
}


/****************************************************
 * ВІДКАТ ПОВЕРНЕННЯ
 ****************************************************/

function rollbackInterbranchReturn_(
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

  const snapshot =
    transaction.snapshot;

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
   * Видаляємо новий рух у відправника.
   */
  if (
    transaction.sourceReturnMovementId
  ) {
    safeRollback(
      function() {
        const row =
          transaction
            .sourceReturnMovementRow ||
          findInterbranchReceiverExactRow_(
            context.sourceMovementSheet,
            1,
            transaction.sourceReturnMovementId
          );

        if (row) {
          deleteInterbranchRowIfMatches_(
            context.sourceMovementSheet,
            row,
            1,
            transaction.sourceReturnMovementId
          );
        }
      }
    );
  }

  /*
   * Видаляємо новий рух у одержувача.
   */
  if (
    transaction.receiverReturnMovementId
  ) {
    safeRollback(
      function() {
        const row =
          transaction
            .receiverReturnMovementRow ||
          findInterbranchReceiverExactRow_(
            context.receiverMovementSheet,
            1,
            transaction.receiverReturnMovementId
          );

        if (row) {
          deleteInterbranchRowIfMatches_(
            context.receiverMovementSheet,
            row,
            1,
            transaction.receiverReturnMovementId
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
            INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
              .journalColumnCount
          )
          .setValues([
            snapshot.sourceJournalValues
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
            INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
              .journalColumnCount
          )
          .setValues([
            snapshot.receiverJournalValues
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
        const range =
          context
            .sourceStockSheet
            .getRange(
              context.sourceStockRow,
              1,
              1,
              INTERBRANCH_TRANSFER_PLANNER_CONFIG
                .stockColumnCount
            );

        range
          .setValues([
            snapshot.sourceStockValues
          ]);

        range
          .setBackgrounds([
            snapshot.sourceStockBackgrounds
          ]);

        context
          .sourceStockSheet
          .getRange(
            context.sourceStockRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .setDataValidation(
            snapshot.sourceActionValidation
          );
      }
    );
  }

  /*
   * Відновлюємо склад одержувача.
   */
  if (
    transaction.receiverStockChanged
  ) {
    safeRollback(
      function() {
        const range =
          context
            .receiverStockSheet
            .getRange(
              context.receiverRow,
              1,
              1,
              INTERBRANCH_TRANSFER_PLANNER_CONFIG
                .stockColumnCount
            );

        range
          .setValues([
            snapshot.receiverStockValues
          ]);

        range
          .setBackgrounds([
            snapshot.receiverStockBackgrounds
          ]);

        context
          .receiverStockSheet
          .getRange(
            context.receiverRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .setDataValidation(
            snapshot.receiverActionValidation
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
 * КОНТРОЛЬНА ПЕРЕВІРКА
 * ПІСЛЯ РЕАЛЬНОГО ПОВЕРНЕННЯ
 ****************************************************/

function verifyInterbranchReturn_(
  transaction
) {
  const context =
    transaction.context;

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const indexes =
    INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
      .journalIndexes;

  const tolerance =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance;

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

  const sourceJournal =
    context
      .sourceJournalSheet
      .getRange(
        context.sourceJournalRow,
        1,
        1,
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .journalColumnCount
      )
      .getValues()[0];

  const receiverJournal =
    context
      .receiverJournalSheet
      .getRange(
        context.receiverJournalRow,
        1,
        1,
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .journalColumnCount
      )
      .getValues()[0];

  const expectedSourceBalance =
    context.sourceLot.currentBalance +
    context.quantity;

  const expectedTransferred =
    Math.max(
      0,
      context
        .sourceLot
        .transferredToBranches -
      context.quantity
    );

  const sourceValidation =
    context
      .sourceStockSheet
      .getRange(
        context.sourceStockRow,
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actionColumn
      )
      .getDataValidation();

  let sourceDropdownContainsTransfer =
    false;

  if (sourceValidation) {
    const criteriaValues =
      sourceValidation
        .getCriteriaValues();

    const allowedValues =
      Array.isArray(
        criteriaValues[0]
      )
        ? criteriaValues[0]
        : [];

    sourceDropdownContainsTransfer =
      allowedValues.indexOf(
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actions
          .transfer
      ) !== -1;
  }

  const checks = {
    sourceBalanceRestored:
      Math.abs(
        interbranchPlannerNumber_(
          sourceValues[
            columns.currentBalance
          ]
        ) -
        expectedSourceBalance
      ) <=
      tolerance,

    sourceTransferredCounterReduced:
      Math.abs(
        interbranchPlannerNumber_(
          sourceValues[
            columns.transferredToBranches
          ]
        ) -
        expectedTransferred
      ) <=
      tolerance,

    sourceTransferStatusReturned:
      interbranchReturnEquals_(
        sourceValues[
          columns.transferStatus
        ],
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .statuses
          .returned
      ),

    sourceActionCleared:
      String(
        sourceValues[
          columns.transferAction
        ] || ''
      ) ===
      '',

    sourceDropdownRestored:
      sourceDropdownContainsTransfer,

    receiverAcceptedQuantityZero:
      Math.abs(
        interbranchPlannerNumber_(
          receiverValues[
            columns.received
          ]
        )
      ) <=
      tolerance,

    receiverBalanceZero:
      Math.abs(
        interbranchPlannerNumber_(
          receiverValues[
            columns.currentBalance
          ]
        )
      ) <=
      tolerance,

    receiverLotBlocked:
      interbranchReturnEquals_(
        receiverValues[
          columns.lotStatus
        ],
        INTERBRANCH_TRANSFER_RETURN_CONFIG
          .lotStatuses
          .blocked
      ),

    receiverTransferStatusReturned:
      interbranchReturnEquals_(
        receiverValues[
          columns.transferStatus
        ],
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .statuses
          .returned
      ),

    receiverActionCleared:
      String(
        receiverValues[
          columns.transferAction
        ] || ''
      ) ===
      '',

    receiverDropdownRemoved:
      context
        .receiverStockSheet
        .getRange(
          context.receiverRow,
          INTERBRANCH_TRANSFER_UI_CONFIG
            .actionColumn
        )
        .getDataValidation() ===
      null,

    sourceJournalReturned:
      interbranchReturnEquals_(
        sourceJournal[
          indexes.status
        ],
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .statuses
          .returned
      ),

    receiverJournalReturned:
      interbranchReturnEquals_(
        receiverJournal[
          indexes.status
        ],
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .statuses
          .returned
      ),

    sourceReturnMovementExists:
      findInterbranchReceiverExactRow_(
        context.sourceMovementSheet,
        1,
        transaction.sourceReturnMovementId
      ) >
      0,

    receiverReturnMovementExists:
      findInterbranchReceiverExactRow_(
        context.receiverMovementSheet,
        1,
        transaction.receiverReturnMovementId
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
            checks[key] === true
          );
        }
      );

  return {
    ok:
      ok,

    checks:
      checks,

    sourceBalance:
      interbranchPlannerNumber_(
        sourceValues[
          columns.currentBalance
        ]
      ),

    sourceTransferredToBranches:
      interbranchPlannerNumber_(
        sourceValues[
          columns.transferredToBranches
        ]
      )
  };
}


/****************************************************
 * ОСНОВНА ФУНКЦІЯ ПОВЕРНЕННЯ
 ****************************************************/

function executeInterbranchReturnCore_(
  request,
  options
) {
  assertInterbranchReturnExecutionDependencies_();

  if (!request) {
    throw new Error(
      'Не передано параметри повернення.'
    );
  }

  const row =
    Number(
      request.row
    ) || 0;

  if (row < 2) {
    throw new Error(
      'Некоректний рядок повернення.'
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

    receiverStockChanged:
      false,

    sourceStockChanged:
      false,

    receiverJournalChanged:
      false,

    sourceJournalChanged:
      false,

    receiverReturnMovementId:
      '',

    receiverReturnMovementRow:
      0,

    sourceReturnMovementId:
      '',

    sourceReturnMovementRow:
      0
  };

  try {
    lock.waitLock(
      INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
        .lockTimeoutMs
    );

    lockAcquired =
      true;

    const executionContext =
      getInterbranchReturnExecutionContext_();

    const context =
      executionContext.context;

    transaction.context =
      context;

    if (
      context.receiverRow !==
      row
    ) {
      throw new Error(
        'Активний рядок повернення змінився. ' +
        'Повторіть перевірку.'
      );
    }

    if (
      !interbranchReturnEquals_(
        context
          .receiverLot
          .currentTransferAction,
        INTERBRANCH_TRANSFER_RETURN_CONFIG
          .expectedAction
      )
    ) {
      throw new Error(
        'У колонці Y має бути вибрано «Повернути».'
      );
    }

    const receiverReturnMovementId =
      context.transferId +
      '-MOV-IN-RETURN';

    const sourceReturnMovementId =
      context.transferId +
      '-MOV-OUT-RETURN';

    transaction.receiverReturnMovementId =
      receiverReturnMovementId;

    transaction.sourceReturnMovementId =
      sourceReturnMovementId;

    if (
      findInterbranchReceiverExactRow_(
        context.receiverMovementSheet,
        1,
        receiverReturnMovementId
      )
    ) {
      throw new Error(
        'Рух повернення одержувача вже існує: ' +
        receiverReturnMovementId
      );
    }

    if (
      findInterbranchReceiverExactRow_(
        context.sourceMovementSheet,
        1,
        sourceReturnMovementId
      )
    ) {
      throw new Error(
        'Рух повернення відправника вже існує: ' +
        sourceReturnMovementId
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

    const sourceRange =
      context
        .sourceStockSheet
        .getRange(
          context.sourceStockRow,
          1,
          1,
          INTERBRANCH_TRANSFER_PLANNER_CONFIG
            .stockColumnCount
        );

    transaction.snapshot = {
      receiverStockValues:
        receiverRange
          .getValues()[0],

      receiverStockBackgrounds:
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
        sourceRange
          .getValues()[0],

      sourceStockBackgrounds:
        sourceRange
          .getBackgrounds()[0],

      sourceActionValidation:
        context
          .sourceStockSheet
          .getRange(
            context.sourceStockRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
          .getDataValidation(),

      receiverJournalValues:
        context
          .receiverJournalSheet
          .getRange(
            context.receiverJournalRow,
            1,
            1,
            INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
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
            INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
              .journalColumnCount
          )
          .getValues()[0]
    };

    const returnedAt =
      new Date();

    const user =
      getInterbranchWriteUser_();

    /************************************************
     * КРОК 1 — СКЛАД ОДЕРЖУВАЧА
     ************************************************/

    receiverRange
      .setValues([
        buildInterbranchReturnedReceiverStockRow_(
          context
        )
      ]);

    transaction.receiverStockChanged =
      true;

    /*
     * Очікування завершене —
     * прибираємо червоне тло.
     */
    receiverRange
      .setBackground(
        null
      );

    /*
     * Дія завершена —
     * прибираємо дропдаун.
     */
    context
      .receiverStockSheet
      .getRange(
        context.receiverRow,
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actionColumn
      )
      .clearDataValidations();

    maybeForceInterbranchReturnFailure_(
      'afterReceiverStock',
      options
    );

    /************************************************
     * КРОК 2 — СКЛАД ВІДПРАВНИКА
     ************************************************/

    sourceRange
      .setValues([
        buildInterbranchReturnedSourceStockRow_(
          context
        )
      ]);

    transaction.sourceStockChanged =
      true;

    /*
     * Відновлюємо можливість
     * створити наступне переміщення.
     */
    context
      .sourceStockSheet
      .getRange(
        context.sourceStockRow,
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actionColumn
      )
      .setDataValidation(
        buildInterbranchReturnedSourceValidation_()
      );

    maybeForceInterbranchReturnFailure_(
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
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .journalColumnCount
      )
      .setValues([
        buildInterbranchReturnedJournalRow_(
          transaction
            .snapshot
            .receiverJournalValues,
          user,
          returnedAt
        )
      ]);

    transaction.receiverJournalChanged =
      true;

    maybeForceInterbranchReturnFailure_(
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
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .journalColumnCount
      )
      .setValues([
        buildInterbranchReturnedJournalRow_(
          transaction
            .snapshot
            .sourceJournalValues,
          user,
          returnedAt
        )
      ]);

    transaction.sourceJournalChanged =
      true;

    maybeForceInterbranchReturnFailure_(
      'afterSourceJournal',
      options
    );

    /************************************************
     * КРОК 5 — РУХ ОДЕРЖУВАЧА
     ************************************************/

    transaction.receiverReturnMovementRow =
      appendInterbranchWriteRow_(
        context.receiverMovementSheet,
        buildInterbranchReceiverReturnMovementRow_(
          context,
          receiverReturnMovementId,
          user,
          returnedAt
        )
      );

    formatInterbranchReturnMovementRow_(
      context.receiverMovementSheet,
      transaction.receiverReturnMovementRow
    );

    maybeForceInterbranchReturnFailure_(
      'afterReceiverMovement',
      options
    );

    /************************************************
     * КРОК 6 — РУХ ВІДПРАВНИКА
     ************************************************/

    transaction.sourceReturnMovementRow =
      appendInterbranchWriteRow_(
        context.sourceMovementSheet,
        buildInterbranchSourceReturnMovementRow_(
          context,
          sourceReturnMovementId,
          user,
          returnedAt
        )
      );

    formatInterbranchReturnMovementRow_(
      context.sourceMovementSheet,
      transaction.sourceReturnMovementRow
    );

    SpreadsheetApp.flush();

    maybeForceInterbranchReturnFailure_(
      'afterAllWrites',
      options
    );

    /************************************************
     * КРОК 7 — КОНТРОЛЬНА ПЕРЕВІРКА
     ************************************************/

    const verification =
      verifyInterbranchReturn_(
        transaction
      );

    if (!verification.ok) {
      throw new Error(
        'Контрольна перевірка повернення не пройдена: ' +
        JSON.stringify(
          verification.checks
        )
      );
    }

    return {
      ok:
        true,

      transferId:
        context.transferId,

      sourceBranch:
        context.sourceBranchName,

      destinationBranch:
        context.receiverBranch.name,

      sourceLotId:
        context.sourceLot.lotId,

      receiverLotId:
        context.receiverLot.lotId,

      inventoryType:
        context.receiverLot.inventoryType,

      inventoryName:
        context.receiverLot.inventoryName,

      quantity:
        context.quantity,

      unitCost:
        context.unitCost,

      totalCost:
        context.totalCost,

      transferStatus:
        INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
          .statuses
          .returned,

      sourceBalance:
        verification.sourceBalance,

      sourceTransferredToBranches:
        verification
          .sourceTransferredToBranches,

      verification:
        verification,
      
      rolledBack:
        false
    };

  } catch (error) {
    const rollback =
      rollbackInterbranchReturn_(
        transaction
      );

    if (!rollback.ok) {
      throw new Error(
        'КРИТИЧНА ПОМИЛКА. Повернення не вдалося повністю відкотити.\n\n' +
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
      'Повернення скасовано і повністю відкочено.\n\n' +
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
 * ЗНІМОК СТАНУ ДЛЯ ТЕСТУ
 ****************************************************/

function snapshotInterbranchReturnState_(
  receiverRow
) {
  const context =
    getInterbranchReceiverContextByRow_(
      receiverRow
    );

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

  const sourceRange =
    context
      .sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      );

  return {
    receiverStockValues:
      receiverRange
        .getValues()[0],

    receiverStockBackgrounds:
      receiverRange
        .getBackgrounds()[0],

    receiverActionValidation:
      getInterbranchReturnValidationSignature_(
        context
          .receiverStockSheet
          .getRange(
            context.receiverRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
      ),

    sourceStockValues:
      sourceRange
        .getValues()[0],

    sourceStockBackgrounds:
      sourceRange
        .getBackgrounds()[0],

    sourceActionValidation:
      getInterbranchReturnValidationSignature_(
        context
          .sourceStockSheet
          .getRange(
            context.sourceStockRow,
            INTERBRANCH_TRANSFER_UI_CONFIG
              .actionColumn
          )
      ),

    receiverJournalValues:
      context
        .receiverJournalSheet
        .getRange(
          context.receiverJournalRow,
          1,
          1,
          INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
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
          INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
            .journalColumnCount
        )
        .getValues()[0],

    receiverMovements:
      getInterbranchReturnMovements_(
        context.receiverMovementSheet,
        context.transferId
      ),

    sourceMovements:
      getInterbranchReturnMovements_(
        context.sourceMovementSheet,
        context.transferId
      ),

    receiverMovementLastRow:
      context
        .receiverMovementSheet
        .getLastRow(),

    sourceMovementLastRow:
      context
        .sourceMovementSheet
        .getLastRow()
  };
}


/****************************************************
 * ПОРІВНЯННЯ СТАНІВ
 ****************************************************/

function compareInterbranchReturnStates_(
  beforeState,
  afterState
) {
  const sectionNames = [
    'receiverStockValues',
    'receiverStockBackgrounds',
    'receiverActionValidation',
    'sourceStockValues',
    'sourceStockBackgrounds',
    'sourceActionValidation',
    'receiverJournalValues',
    'sourceJournalValues',
    'receiverMovements',
    'sourceMovements',
    'receiverMovementLastRow',
    'sourceMovementLastRow'
  ];

  const sections = {};
  const differences = {};

  sectionNames.forEach(
    function(sectionName) {
      const beforeJson =
        JSON.stringify(
          beforeState[
            sectionName
          ]
        );

      const afterJson =
        JSON.stringify(
          afterState[
            sectionName
          ]
        );

      const equal =
        beforeJson ===
        afterJson;

      sections[
        sectionName
      ] =
        equal;

      if (!equal) {
        differences[
          sectionName
        ] = {
          before:
            beforeState[
              sectionName
            ],

          after:
            afterState[
              sectionName
            ]
        };
      }
    }
  );

  const exactStateRestored =
    sectionNames.every(
      function(sectionName) {
        return (
          sections[
            sectionName
          ] ===
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
 * ТЕСТ ПОВНОГО КОНТРОЛЬОВАНОГО ВІДКАТУ
 ****************************************************/

function testInterbranchTransferReturnRollback() {
  assertInterbranchReturnExecutionDependencies_();

  const auditBefore =
    auditInterbranchTransferReturn();

  const receiverRow =
    auditBefore.receiverRow;

  const beforeState =
    snapshotInterbranchReturnState_(
      receiverRow
    );

  let expectedFailureOccurred =
    false;

  let failureMessage =
    '';

  try {
    executeInterbranchReturnCore_(
      {
        row:
          receiverRow
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
    snapshotInterbranchReturnState_(
      receiverRow
    );

  const comparison =
    compareInterbranchReturnStates_(
      beforeState,
      afterState
    );

  const auditAfter =
    auditInterbranchTransferReturn();

  const checks = {
    expectedFailureOccurred:
      expectedFailureOccurred,

    receiverStockValuesRestored:
      comparison
        .sections
        .receiverStockValues,

    receiverStockBackgroundRestored:
      comparison
        .sections
        .receiverStockBackgrounds,

    receiverDropdownRestored:
      comparison
        .sections
        .receiverActionValidation,

    sourceStockValuesRestored:
      comparison
        .sections
        .sourceStockValues,

    sourceStockBackgroundRestored:
      comparison
        .sections
        .sourceStockBackgrounds,

    sourceDropdownRestored:
      comparison
        .sections
        .sourceActionValidation,

    receiverJournalRestored:
      comparison
        .sections
        .receiverJournalValues,

    sourceJournalRestored:
      comparison
        .sections
        .sourceJournalValues,

    receiverMovementsRestored:
      comparison
        .sections
        .receiverMovements,

    sourceMovementsRestored:
      comparison
        .sections
        .sourceMovements,

    receiverMovementRowsRestored:
      comparison
        .sections
        .receiverMovementLastRow,

    sourceMovementRowsRestored:
      comparison
        .sections
        .sourceMovementLastRow,

    exactStateRestored:
      comparison
        .exactStateRestored,

    auditStillPasses:
      auditAfter.safeToReturn ===
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
            checks[key] === true
          );
        }
      );

  const result = {
    ok:
      ok,

    test:
      'testInterbranchTransferReturnRollback',

    version:
      INTERBRANCH_TRANSFER_RETURN_EXECUTION_CONFIG
        .version,

    transferId:
      auditBefore.transferId,

    sourceBranch:
      auditBefore.sourceBranch,

    destinationBranch:
      auditBefore.destinationBranch,

    receiverRow:
      receiverRow,

    sourceStockRow:
      auditBefore.sourceStockRow,

    quantity:
      auditBefore.quantity,

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
            'Контрольований відкат повернення пройдено. ' +
            'Переміщення залишилося в очікуванні.'
          )
        : (
            'Тест відкату повернення не пройдено. ' +
            'Перевірте differences.'
          ),
      'Переміщення між філіями',
      10
    );

  if (!ok) {
    throw new Error(
      'Тест контрольованого відкату повернення не пройдено.'
    );
  }

  return result;
}
/****************************************************
 * ВИКЛИК ПОВЕРНЕННЯ З HTML-ДІАЛОГУ
 ****************************************************/

function executeInterbranchReturnFromDialog(
  request
) {
  assertInterbranchReturnExecutionDependencies_();

  if (!request) {
    throw new Error(
      'Не передано параметри повернення.'
    );
  }

  const action =
    String(
      request.action || ''
    ).trim();

  const expectedAction =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .returnToSender;

  if (
    interbranchPlannerNormalize_(
      action
    ) !==
    interbranchPlannerNormalize_(
      expectedAction
    )
  ) {
    throw new Error(
      'Для цієї операції очікується дія «Повернути».'
    );
  }

  const row =
    Number(
      request.row
    ) || 0;

  if (row < 2) {
    throw new Error(
      'Некоректний рядок повернення.'
    );
  }

  const result =
    executeInterbranchReturnCore_(
      {
        row:
          row
      },
      {}
    );

  SpreadsheetApp
    .getActive()
    .toast(
      'Товар повернуто відправнику: ' +
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