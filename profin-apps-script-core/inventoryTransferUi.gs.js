/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПЕРЕМІЩЕННЯ
 * КРОК 3. ІНТЕРФЕЙС І СУХЕ ПІДТВЕРДЖЕННЯ
 *
 * ЗАЛЕЖНОСТІ:
 * — inventoryTransferConfig.gs
 * — inventoryTransferPlanner.gs
 *
 * ЦЕЙ МОДУЛЬ:
 * — створює контекстні дропдауни в колонці Y;
 * — відкриває діалог переміщення;
 * — формує сухий план;
 * — не змінює залишки;
 * — не створює рухи;
 * — не записує журнал переміщень;
 * — не записує дані в іншу таблицю.
 ****************************************************/


const INTERBRANCH_TRANSFER_UI_CONFIG =
  Object.freeze({

    version:
      '1.0',

    actionColumn:
      25, // Y

    actions:
      Object.freeze({
        transfer:
          'Перемістити',

        accept:
          'Прийняти',

        returnToSender:
          'Повернути'
      }),

    dialog:
      Object.freeze({
        htmlFile:
          'InterbranchTransferDialog',

        title:
          'Переміщення між філіями',

        width:
          560,

        height:
          720
      })
  });


/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assertInterbranchUiDependencies_() {
  if (
    typeof INTERBRANCH_TRANSFER_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_CONFIG. ' +
      'Перевірте модуль inventoryTransferConfig.gs.'
    );
  }

  if (
    typeof INTERBRANCH_TRANSFER_PLANNER_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено INTERBRANCH_TRANSFER_PLANNER_CONFIG. ' +
      'Перевірте модуль inventoryTransferPlanner.gs.'
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
    typeof getInterbranchTransferSourceLot_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію getInterbranchTransferSourceLot_().'
    );
  }

  if (
    typeof planInterbranchTransfer_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію planInterbranchTransfer_().'
    );
  }

  if (
    typeof isInterbranchLotStatusBlocked_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію isInterbranchLotStatusBlocked_().'
    );
  }

  if (
    typeof isInterbranchTransferPending_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено функцію isInterbranchTransferPending_().'
    );
  }

  return true;
}


/****************************************************
 * ДОДАВАННЯ МЕНЮ
 *
 * На цьому кроці функція запускається вручну
 * через installInterbranchTransferUiStep3().
 ****************************************************/

/****************************************************
 * ЧИТАННЯ МІНІМАЛЬНОГО СТАНУ РЯДКА
 *
 * @param {Array} rowValues
 * @return {Object}
 ****************************************************/

function getInterbranchUiLotStateFromRow_(
  rowValues
) {
  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  return {
    lotId:
      String(
        rowValues[
          columns.lotId
        ] || ''
      ).trim(),

    inventoryType:
      String(
        rowValues[
          columns.inventoryType
        ] || ''
      ).trim(),

    inventoryName:
      String(
        rowValues[
          columns.inventoryName
        ] || ''
      ).trim(),

    currentBalance:
      interbranchPlannerNumber_(
        rowValues[
          columns.currentBalance
        ]
      ),

    minimumStock:
      interbranchPlannerNumber_(
        rowValues[
          columns.minimumStock
        ]
      ),

    lotStatus:
      String(
        rowValues[
          columns.lotStatus
        ] || ''
      ).trim(),

    sourceBranch:
      String(
        rowValues[
          columns.sourceBranch
        ] || ''
      ).trim(),

    destinationBranch:
      String(
        rowValues[
          columns.destinationBranch
        ] || ''
      ).trim(),

    transferQuantity:
      interbranchPlannerNumber_(
        rowValues[
          columns.transferQuantity
        ]
      ),

    transferStatus:
      String(
        rowValues[
          columns.transferStatus
        ] || ''
      ).trim(),

    action:
      String(
        rowValues[
          columns.transferAction
        ] || ''
      ).trim(),

    transferId:
      String(
        rowValues[
          columns.transferId
        ] || ''
      ).trim()
  };
}


/****************************************************
 * ДОЗВОЛЕНІ ДІЇ ДЛЯ РЯДКА
 *
 * @param {Object} lotState
 * @param {string} currentBranchName
 * @return {string[]}
 ****************************************************/

function getInterbranchAllowedActionsForLot_(
  lotState,
  currentBranchName
) {
  const actions =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions;

  if (
    !lotState ||
    !lotState.lotId
  ) {
    return [];
  }

  const normalizedCurrentBranch =
    interbranchPlannerNormalize_(
      currentBranchName
    );

  const normalizedSourceBranch =
    interbranchPlannerNormalize_(
      lotState.sourceBranch
    );

  const normalizedDestinationBranch =
    interbranchPlannerNormalize_(
      lotState.destinationBranch
    );

  const pending =
    isInterbranchTransferPending_(
      lotState.transferStatus
    );

  const isIncomingPendingTransfer =
    pending &&
    normalizedDestinationBranch ===
      normalizedCurrentBranch &&
    Boolean(
      normalizedSourceBranch
    ) &&
    normalizedSourceBranch !==
      normalizedCurrentBranch;

  /*
   * Вхідна передача, яка ще не прийнята.
   */
  if (
    isIncomingPendingTransfer
  ) {
    return [
      actions.accept,
      actions.returnToSender
    ];
  }

  /*
   * Звичайна доступна партія.
   */
  const canTransfer =
    lotState.currentBalance >
      INTERBRANCH_TRANSFER_PLANNER_CONFIG
        .tolerance &&
    !isInterbranchLotStatusBlocked_(
      lotState.lotStatus
    ) &&
    !pending;

  if (canTransfer) {
    return [
      actions.transfer
    ];
  }

  return [];
}


/****************************************************
 * ВСТАНОВЛЕННЯ ДРОПДАУНІВ У Y
 *
 * Змінює тільки правила перевірки даних.
 * Значення клітинок і складські показники
 * не змінює.
 ****************************************************/

function installInterbranchTransferUiStep3() {
  assertInterbranchUiDependencies_();

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const currentBranch =
    getCurrentInterbranchBranch_(
      spreadsheet.getId()
    );

  if (!currentBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації філій.'
    );
  }

  const stockSheet =
    spreadsheet
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
      '".'
    );
  }

  const lastRow =
    stockSheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp
      .getActive()
      .toast(
        'На складі немає партій для створення дропдаунів.',
        'Переміщення між філіями',
        8
      );

    return {
      ok:
        true,

      branch:
        currentBranch.name,

      rowsProcessed:
        0,

      transferRows:
        0,

      receiverRows:
        0,

      blockedRows:
        0,

      businessValuesChanged:
        false
    };
  }

  const rowCount =
    lastRow - 1;

  const values =
    stockSheet
      .getRange(
        2,
        1,
        rowCount,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues();

  const validations = [];

  let transferRows =
    0;

  let receiverRows =
    0;

  let blockedRows =
    0;

  values.forEach(
    function(rowValues) {
      const lotState =
        getInterbranchUiLotStateFromRow_(
          rowValues
        );

      const allowedActions =
        getInterbranchAllowedActionsForLot_(
          lotState,
          currentBranch.name
        );

      if (
        allowedActions.length === 0
      ) {
        validations.push([
          null
        ]);

        blockedRows++;

        return;
      }

      if (
        allowedActions.indexOf(
          INTERBRANCH_TRANSFER_UI_CONFIG
            .actions
            .transfer
        ) !== -1
      ) {
        transferRows++;
      } else {
        receiverRows++;
      }

      const rule =
        SpreadsheetApp
          .newDataValidation()
          .requireValueInList(
            allowedActions,
            true
          )
          .setAllowInvalid(
            false
          )
          .setHelpText(
            'Оберіть дозволену дію для цієї складської партії.'
          )
          .build();

      validations.push([
        rule
      ]);
    }
  );

  stockSheet
    .getRange(
      2,
      INTERBRANCH_TRANSFER_UI_CONFIG
        .actionColumn,
      rowCount,
      1
    )
    .setDataValidations(
      validations
    );

  SpreadsheetApp.flush();

  const result = {
    ok:
      true,

    branch:
      currentBranch.name,

    rowsProcessed:
      rowCount,

    transferRows:
      transferRows,

    receiverRows:
      receiverRows,

    blockedRows:
      blockedRows,

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
      'Дропдауни оновлено. Доступно для переміщення: ' +
      transferRows +
      '. Очікує приймання: ' +
      receiverRows +
      '.',
      'Переміщення між філіями',
      10
    );

  return result;
}


/****************************************************
 * ОТРИМАННЯ АКТИВНОГО РЯДКА СКЛАДУ
 ****************************************************/

function getActiveInterbranchStockContext_() {
  assertInterbranchUiDependencies_();

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    spreadsheet.getActiveSheet();

  if (
    !sheet ||
    sheet.getName() !==
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock
  ) {
    throw new Error(
      'Спочатку відкрийте лист "' +
      INTERBRANCH_TRANSFER_CONFIG
        .sheetNames
        .stock +
      '" і виберіть потрібну партію.'
    );
  }

  const activeRange =
    sheet.getActiveRange();

  if (!activeRange) {
    throw new Error(
      'Не вибрано складський рядок.'
    );
  }

  const row =
    activeRange.getRow();

  if (row < 2) {
    throw new Error(
      'Потрібно вибрати рядок складської партії, а не заголовок.'
    );
  }

  const currentBranch =
    getCurrentInterbranchBranch_(
      spreadsheet.getId()
    );

  if (!currentBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації філій.'
    );
  }

  const lot =
    getInterbranchTransferSourceLot_(
      sheet,
      row
    );

  const lotState = {
    lotId:
      lot.lotId,

    inventoryType:
      lot.inventoryType,

    inventoryName:
      lot.inventoryName,

    currentBalance:
      lot.currentBalance,

    minimumStock:
      lot.minimumStock,

    lotStatus:
      lot.lotStatus,

    sourceBranch:
      lot.currentTransferSourceBranch,

    destinationBranch:
      lot.currentTransferDestinationBranch,

    transferQuantity:
      lot.currentTransferQuantity,

    transferStatus:
      lot.currentTransferStatus,

    action:
      lot.currentTransferAction,

    transferId:
      lot.currentTransferId
  };

  const allowedActions =
    getInterbranchAllowedActionsForLot_(
      lotState,
      currentBranch.name
    );

  return {
    spreadsheet:
      spreadsheet,

    sheet:
      sheet,

    row:
      row,

    currentBranch:
      currentBranch,

    lot:
      lot,

    allowedActions:
      allowedActions
  };
}


/****************************************************
 * ПЕРЕЛІК МОЖЛИВИХ ФІЛІЙ-ОДЕРЖУВАЧІВ
 ****************************************************/

function getInterbranchDestinationOptions_(
  currentBranchName
) {
  return Object
    .keys(
      INTERBRANCH_TRANSFER_CONFIG
        .branches
    )
    .filter(
      function(branchName) {
        return (
          branchName !==
          currentBranchName
        );
      }
    )
    .map(
      function(branchName) {
        const config =
          INTERBRANCH_TRANSFER_CONFIG
            .branches[
              branchName
            ];

        return {
          name:
            branchName,

          code:
            config.code
        };
      }
    );
}


/****************************************************
 * ФОРМАТУВАННЯ ДАТИ ДЛЯ ДІАЛОГУ
 ****************************************************/

function formatInterbranchUiDate_(
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
    return '';
  }

  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


/****************************************************
 * ФОРМУВАННЯ ДАНИХ ДЛЯ ДІАЛОГУ
 ****************************************************/

function buildInterbranchDialogPayload_(
  context,
  selectedAction
) {
  const lot =
    context.lot;

  const actions =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions;

  const isTransfer =
    selectedAction ===
    actions.transfer;

  const isAccept =
    selectedAction ===
    actions.accept;

  const isReturn =
    selectedAction ===
    actions.returnToSender;

  return {
    dryRun:
      true,

    version:
      INTERBRANCH_TRANSFER_UI_CONFIG
        .version,

    action:
      selectedAction,

    actionMode:
      isTransfer
        ? 'transfer'
        : (
            isAccept
              ? 'accept'
              : (
                  isReturn
                    ? 'return'
                    : ''
                )
          ),

    row:
      context.row,

    currentBranch:
      context.currentBranch.name,

    destinationOptions:
      getInterbranchDestinationOptions_(
        context.currentBranch.name
      ),

    defaultDestinationBranch:
      isTransfer
        ? (
            getInterbranchDestinationOptions_(
              context.currentBranch.name
            )[0]
              ? getInterbranchDestinationOptions_(
                  context.currentBranch.name
                )[0].name
              : ''
          )
        : lot.currentTransferDestinationBranch,

    transferId:
      lot.currentTransferId,

    sourceBranch:
      isTransfer
        ? context.currentBranch.name
        : lot.currentTransferSourceBranch,

    destinationBranch:
      isTransfer
        ? ''
        : lot.currentTransferDestinationBranch,

    lotId:
      lot.lotId,

    inventoryType:
      lot.inventoryType,

    inventoryName:
      lot.inventoryName,

    series:
      lot.series,

    expiryDate:
      formatInterbranchUiDate_(
        lot.expiryDate
      ),

    receiptDate:
      formatInterbranchUiDate_(
        lot.receiptDate
      ),

    supplier:
      lot.supplier,

    currentBalance:
      lot.currentBalance,

    minimumStock:
      lot.minimumStock,

    lotStatus:
      lot.lotStatus,

    unitCost:
      lot.unitCost,

    quantity:
      isTransfer
        ? Math.min(
            1,
            lot.currentBalance
          )
        : lot.currentTransferQuantity,

    maxQuantity:
      isTransfer
        ? lot.currentBalance
        : lot.currentTransferQuantity,

    transferStatus:
      lot.currentTransferStatus,

    noCellsWritten:
      true
  };
}


/****************************************************
 * БЕЗПЕЧНА ПЕРЕДАЧА JSON У HTML
 ****************************************************/

function stringifyInterbranchPayloadForHtml_(
  payload
) {
  return JSON
    .stringify(
      payload
    )
    .replace(
      /</g,
      '\\u003c'
    );
}


/****************************************************
 * ВІДКРИТТЯ ДІАЛОГУ
 ****************************************************/

function openInterbranchTransferDialog() {
  const ui =
    SpreadsheetApp.getUi();

  try {
    const context =
      getActiveInterbranchStockContext_();

    const selectedAction =
      String(
        context.lot
          .currentTransferAction || ''
      ).trim();

    if (!selectedAction) {
      throw new Error(
        'У колонці Y «Дія» спочатку оберіть доступну дію.'
      );
    }

    if (
      context.allowedActions.indexOf(
        selectedAction
      ) === -1
    ) {
      throw new Error(
        'Дія "' +
        selectedAction +
        '" недоступна для цієї партії. ' +
        'Оновіть дропдауни та перевірте статус партії.'
      );
    }

    const payload =
      buildInterbranchDialogPayload_(
        context,
        selectedAction
      );

    const template =
      HtmlService
        .createTemplateFromFile(
          INTERBRANCH_TRANSFER_UI_CONFIG
            .dialog
            .htmlFile
        );

    template.payloadJson =
      stringifyInterbranchPayloadForHtml_(
        payload
      );

    const html =
      template
        .evaluate()
        .setWidth(
          INTERBRANCH_TRANSFER_UI_CONFIG
            .dialog
            .width
        )
        .setHeight(
          INTERBRANCH_TRANSFER_UI_CONFIG
            .dialog
            .height
        );

    ui.showModalDialog(
      html,
      INTERBRANCH_TRANSFER_UI_CONFIG
        .dialog
        .title
    );

    return payload;

  } catch (error) {
    ui.alert(
      'Переміщення між філіями',
      String(
        error &&
        error.message
          ? error.message
          : error
      ),
      ui.ButtonSet.OK
    );

    return null;
  }
}


/****************************************************
 * СУХИЙ ПЛАН ПРИЙМАННЯ АБО ПОВЕРНЕННЯ
 *
 * Нічого не записує.
 ****************************************************/

function planInterbranchReceiverActionDry_(
  lot,
  currentBranch,
  action
) {
  const actions =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions;

  const errors = [];
  const warnings = [];

  if (!lot.currentTransferId) {
    errors.push(
      'У партії не визначено ID переміщення.'
    );
  }

  if (
    !isInterbranchTransferPending_(
      lot.currentTransferStatus
    )
  ) {
    errors.push(
      'Переміщення не має статусу очікування приймання.'
    );
  }

  if (
    interbranchPlannerNormalize_(
      lot.currentTransferDestinationBranch
    ) !==
    interbranchPlannerNormalize_(
      currentBranch.name
    )
  ) {
    errors.push(
      'Поточна філія не є одержувачем цього переміщення.'
    );
  }

  const quantity =
    interbranchPlannerNumber_(
      lot.currentTransferQuantity
    );

  if (
    quantity <=
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    errors.push(
      'Не визначено кількість переміщення.'
    );
  }

  if (
    lot.currentBalance >
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance
  ) {
    warnings.push(
      'Партія вже має позитивний доступний залишок. ' +
      'Перед фактичним прийманням це потрібно перевірити.'
    );
  }

  if (errors.length > 0) {
    throw new Error(
      errors.join('\n')
    );
  }

  const totalCost =
    interbranchPlannerRoundMoney_(
      quantity *
      lot.unitCost
    );

  if (
    action ===
    actions.accept
  ) {
    const plannedLotStatus =
      quantity <=
      lot.minimumStock
        ? 'Низький залишок'
        : 'Активна';

    return {
      ok:
        true,

      requiresWrite:
        false,

      action:
        action,

      transferId:
        lot.currentTransferId,

      sourceBranch:
        lot.currentTransferSourceBranch,

      destinationBranch:
        currentBranch.name,

      receiverLotId:
        lot.lotId,

      inventoryType:
        lot.inventoryType,

      inventoryName:
        lot.inventoryName,

      series:
        lot.series,

      quantity:
        quantity,

      unitCost:
        lot.unitCost,

      totalCost:
        totalCost,

      plannedAcceptedQuantity:
        quantity,

      plannedCurrentBalance:
        quantity,

      plannedLotStatus:
        plannedLotStatus,

      plannedTransferStatus:
        'Прийнято',

      plannedMovementType:
        'Прийняття з філії',

      warnings:
        warnings,

      noCellsWritten:
        true
    };
  }

  if (
    action ===
    actions.returnToSender
  ) {
    return {
      ok:
        true,

      requiresWrite:
        false,

      action:
        action,

      transferId:
        lot.currentTransferId,

      sourceBranch:
        lot.currentTransferSourceBranch,

      destinationBranch:
        currentBranch.name,

      receiverLotId:
        lot.lotId,

      inventoryType:
        lot.inventoryType,

      inventoryName:
        lot.inventoryName,

      series:
        lot.series,

      quantity:
        quantity,

      unitCost:
        lot.unitCost,

      totalCost:
        totalCost,

      plannedAcceptedQuantity:
        0,

      plannedCurrentBalance:
        0,

      plannedLotStatus:
        'Заблокована',

      plannedTransferStatus:
        'Повернуто',

      plannedMovementType:
        'Повернення відправнику',

      warnings:
        warnings,

      noCellsWritten:
        true
    };
  }

  throw new Error(
    'Невідома дія одержувача: ' +
    action
  );
}


/****************************************************
 * СЕРВЕРНА ФУНКЦІЯ ДЛЯ HTML-ДІАЛОГУ
 *
 * request:
 * {
 *   row: 3,
 *   action: 'Перемістити',
 *   destinationBranch: 'Бабурка',
 *   quantity: 1
 * }
 *
 * Нічого не записує.
 ****************************************************/

function previewInterbranchActionFromDialog(
  request
) {
  assertInterbranchUiDependencies_();

  if (!request) {
    throw new Error(
      'Не передано параметри сухого плану.'
    );
  }

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const currentBranch =
    getCurrentInterbranchBranch_(
      spreadsheet.getId()
    );

  if (!currentBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації філій.'
    );
  }

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

  const row =
    Number(
      request.row
    ) || 0;

  const action =
    String(
      request.action || ''
    ).trim();

  const lot =
    getInterbranchTransferSourceLot_(
      stockSheet,
      row
    );

  const lotState = {
    lotId:
      lot.lotId,

    currentBalance:
      lot.currentBalance,

    lotStatus:
      lot.lotStatus,

    sourceBranch:
      lot.currentTransferSourceBranch,

    destinationBranch:
      lot.currentTransferDestinationBranch,

    transferQuantity:
      lot.currentTransferQuantity,

    transferStatus:
      lot.currentTransferStatus,

    action:
      lot.currentTransferAction,

    transferId:
      lot.currentTransferId
  };

  const allowedActions =
    getInterbranchAllowedActionsForLot_(
      lotState,
      currentBranch.name
    );

  if (
    allowedActions.indexOf(
      action
    ) === -1
  ) {
    throw new Error(
      'Дія "' +
      action +
      '" більше не доступна для цієї партії. ' +
      'Оновіть дропдауни та повторіть перевірку.'
    );
  }

  let result;

  if (
    action ===
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .transfer
  ) {
    result =
      planInterbranchTransfer_({
        sourceRow:
          row,

        destinationBranch:
          String(
            request.destinationBranch || ''
          ).trim(),

        quantity:
          interbranchPlannerNumber_(
            request.quantity
          ),

        operationDate:
          new Date()
      });
  } else {
    result =
      planInterbranchReceiverActionDry_(
        lot,
        currentBranch,
        action
      );
  }

  /*
   * Перетворюємо Date на текст,
   * щоб відповідь безпечно передалася в HTML.
   */
  return JSON.parse(
    JSON.stringify(
      result
    )
  );
}


/****************************************************
 * СУХИЙ ТЕСТ ІНТЕРФЕЙСУ
 *
 * Перевіряє:
 * — створення дропдаунів;
 * — наявність «Перемістити»;
 * — формування сухого плану;
 * — відсутність змін значень A:AB.
 ****************************************************/

function testInterbranchTransferUiStep3() {
  assertInterbranchUiDependencies_();

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const currentBranch =
    getCurrentInterbranchBranch_(
      spreadsheet.getId()
    );

  if (!currentBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації.'
    );
  }

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

  const lastRow =
    stockSheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'На складі немає партій для тестування.'
    );
  }

  const rowCount =
    lastRow - 1;

  const valuesBefore =
    stockSheet
      .getRange(
        2,
        1,
        rowCount,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues();

  const installResult =
    installInterbranchTransferUiStep3();

  const allValues =
    stockSheet
      .getRange(
        2,
        1,
        rowCount,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues();

  let testRow =
    0;

  for (
    let index = 0;
    index < allValues.length;
    index++
  ) {
    const lotState =
      getInterbranchUiLotStateFromRow_(
        allValues[index]
      );

    const actions =
      getInterbranchAllowedActionsForLot_(
        lotState,
        currentBranch.name
      );

    if (
      actions.indexOf(
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actions
          .transfer
      ) !== -1
    ) {
      testRow =
        index + 2;

      break;
    }
  }

  if (!testRow) {
    throw new Error(
      'Не знайдено партії, доступної для тестового переміщення.'
    );
  }

  const validation =
    stockSheet
      .getRange(
        testRow,
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actionColumn
      )
      .getDataValidation();

  let dropdownContainsTransfer =
    false;

  if (validation) {
    const criteriaValues =
      validation
        .getCriteriaValues();

    const allowedValues =
      Array.isArray(
        criteriaValues[0]
      )
        ? criteriaValues[0]
        : [];

    dropdownContainsTransfer =
      allowedValues.indexOf(
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actions
          .transfer
      ) !== -1;
  }

  const destinationBranch =
    getRemoteInterbranchBranch_(
      currentBranch.name
    );

  const dryPlan =
    planInterbranchTransfer_({
      sourceRow:
        testRow,

      destinationBranch:
        destinationBranch.name,

      quantity:
        1,

      operationDate:
        new Date()
    });

  const valuesAfter =
    stockSheet
      .getRange(
        2,
        1,
        rowCount,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues();

  const noBusinessValuesChanged =
    JSON.stringify(
      valuesBefore
    ) ===
    JSON.stringify(
      valuesAfter
    );

  const checks = {
    installationOk:
      installResult.ok === true,

    testRowFound:
      testRow > 1,

    dropdownCreated:
      Boolean(
        validation
      ),

    dropdownContainsTransfer:
      dropdownContainsTransfer,

    dryPlanOk:
      dryPlan.ok === true,

    noWriteRequired:
      dryPlan.requiresWrite === false,

    noBusinessValuesChanged:
      noBusinessValuesChanged,

    noCellsWrittenByPlanner:
      dryPlan.noCellsWritten === true
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
      'testInterbranchTransferUiStep3',

    version:
      INTERBRANCH_TRANSFER_UI_CONFIG
        .version,

    branch:
      currentBranch.name,

    testRow:
      testRow,

    installResult:
      installResult,

    dryPlan:
      dryPlan,

    checks:
      checks,

    businessValuesChanged:
      !noBusinessValuesChanged
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
            'Крок 3 пройдено. Дропдаун і сухий діалог готові.'
          )
        : (
            'Крок 3 не пройдено. Перевірте журнал виконання.'
          ),
      'Переміщення між філіями',
      10
    );

  if (!ok) {
    throw new Error(
      'Сухий тест інтерфейсу не пройдено.'
    );
  }

  return result;
}
/****************************************************
 * ЗАПУСК ДІАЛОГУ З КНОПКИ НА ЛИСТІ
 *
 * Кнопка-малюнок змінює активний рядок на рядок,
 * де вона розташована. Тому функція не покладається
 * на активний рядок, а знаходить єдину вибрану дію
 * у колонці Y.
 ****************************************************/

function openInterbranchTransferDialogFromButton() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    spreadsheet.getActiveSheet();

  const ui =
    SpreadsheetApp.getUi();

  const expectedSheetName =
    INTERBRANCH_TRANSFER_CONFIG
      .sheetNames
      .stock;

  if (
    sheet.getName() !==
    expectedSheetName
  ) {
    ui.alert(
      'Переміщення між філіями',
      'Кнопка працює лише на листі «' +
        expectedSheetName +
        '».',
      ui.ButtonSet.OK
    );

    return;
  }

  const actionColumn =
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actionColumn;

  const firstDataRow =
    2;

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow <
    firstDataRow
  ) {
    ui.alert(
      'Переміщення між філіями',
      'На листі немає складських партій.',
      ui.ButtonSet.OK
    );

    return;
  }

  const allowedActions = [
    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .transfer,

    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .accept,

    INTERBRANCH_TRANSFER_UI_CONFIG
      .actions
      .returnToSender
  ]
    .filter(
      function(action) {
        return Boolean(action);
      }
    )
    .map(
      function(action) {
        return interbranchPlannerNormalize_(
          action
        );
      }
    );

  const actionValues =
    sheet
      .getRange(
        firstDataRow,
        actionColumn,
        lastRow - firstDataRow + 1,
        1
      )
      .getDisplayValues();

  const selectedActions =
    [];

  actionValues.forEach(
    function(rowValues, index) {
      const action =
        String(
          rowValues[0] || ''
        ).trim();

      if (!action) {
        return;
      }

      const normalizedAction =
        interbranchPlannerNormalize_(
          action
        );

      if (
        allowedActions.indexOf(
          normalizedAction
        ) === -1
      ) {
        return;
      }

      selectedActions.push({
        row:
          firstDataRow + index,

        action:
          action
      });
    }
  );

  if (
    selectedActions.length ===
    0
  ) {
    ui.alert(
      'Переміщення між філіями',
      'У колонці Y «Дія» спочатку оберіть одну дію:\n\n' +
        '• Перемістити\n' +
        '• Прийняти\n' +
        '• Повернути',
      ui.ButtonSet.OK
    );

    return;
  }

  if (
    selectedActions.length >
    1
  ) {
    const rowsText =
      selectedActions
        .map(
          function(item) {
            return (
              'Рядок ' +
              item.row +
              ' — ' +
              item.action
            );
          }
        )
        .join('\n');

    ui.alert(
      'Переміщення між філіями',
      'Знайдено кілька вибраних дій:\n\n' +
        rowsText +
        '\n\nОчистіть зайві значення в колонці Y. ' +
        'Для виконання має залишитися тільки одна дія.',
      ui.ButtonSet.OK
    );

    return;
  }

  const selectedAction =
    selectedActions[0];

  const actionCell =
    sheet.getRange(
      selectedAction.row,
      actionColumn
    );

  /*
   * Передаємо вже протестованій функції саме
   * знайдений рядок складської партії.
   */
  sheet.setActiveRange(
    actionCell
  );

  SpreadsheetApp.flush();

  openInterbranchTransferDialog();
}
/****************************************************
 * ОНОВЛЕННЯ ДРОПДАУНА ДІЇ ДЛЯ ОДНОГО РЯДКА
 *
 * Змінює тільки:
 * — значення Y, якщо воно більше не дозволене;
 * — правило перевірки даних у Y.
 *
 * Не змінює складські показники.
 ****************************************************/

function refreshInterbranchActionValidationForRow_(
  spreadsheet,
  row
) {
  assertInterbranchUiDependencies_();

  const ss =
    spreadsheet ||
    SpreadsheetApp.getActiveSpreadsheet();

  const stockRow =
    Number(row) || 0;

  if (stockRow < 2) {
    throw new Error(
      'Некоректний рядок для оновлення дропдауна дії.'
    );
  }

  const currentBranch =
    getCurrentInterbranchBranch_(
      ss.getId()
    );

  if (!currentBranch) {
    throw new Error(
      'Поточна таблиця не знайдена у конфігурації філій.'
    );
  }

  const stockSheet =
    ss.getSheetByName(
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
      '".'
    );
  }

  const rowValues =
    stockSheet
      .getRange(
        stockRow,
        1,
        1,
        INTERBRANCH_TRANSFER_PLANNER_CONFIG
          .stockColumnCount
      )
      .getValues()[0];

  const lotState =
    getInterbranchUiLotStateFromRow_(
      rowValues
    );

  const allowedActions =
    getInterbranchAllowedActionsForLot_(
      lotState,
      currentBranch.name
    );

  const actionCell =
    stockSheet.getRange(
      stockRow,
      INTERBRANCH_TRANSFER_UI_CONFIG
        .actionColumn
    );

  const currentAction =
    String(
      actionCell.getDisplayValue() || ''
    ).trim();

  /*
   * Спочатку прибираємо стару validation:
   * наприклад «Прийняти / Повернути».
   */
  actionCell.clearDataValidations();

  /*
   * Якщо дій більше немає —
   * очищаємо старе значення.
   */
  if (allowedActions.length === 0) {
    if (currentAction) {
      actionCell.clearContent();
    }

    return {
      ok:
        true,

      row:
        stockRow,

      allowedActions:
        [],

      validationCreated:
        false
    };
  }

  /*
   * Старе значення очищається тільки тоді,
   * коли воно вже не входить до нового списку.
   */
  if (
    currentAction &&
    allowedActions.indexOf(
      currentAction
    ) === -1
  ) {
    actionCell.clearContent();
  }

  const rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        allowedActions,
        true
      )
      .setAllowInvalid(
        false
      )
      .setHelpText(
        'Оберіть дозволену дію для цієї складської партії.'
      )
      .build();

  actionCell.setDataValidation(
    rule
  );

  return {
    ok:
      true,

    row:
      stockRow,

    allowedActions:
      allowedActions,

    validationCreated:
      true
  };
}