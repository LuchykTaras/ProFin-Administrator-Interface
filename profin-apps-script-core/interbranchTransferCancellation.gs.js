/**
 * УНІВЕРСАЛЬНЕ СКАСУВАННЯ ПРИЙНЯТОГО
 * МІЖФІЛІЙНОГО ПЕРЕМІЩЕННЯ.
 *
 * Працює лише якщо отримана партія ще не була
 * продана, використана, передана на зберігання
 * або списана.
 *
 * Залежності:
 * - INTERBRANCH_TRANSFER_CONFIG
 * - INTERBRANCH_TRANSFER_PLANNER_CONFIG
 * - INTERBRANCH_TRANSFER_UI_CONFIG
 */

const INTERBRANCH_TRANSFER_CANCELLATION_CONFIG =
  Object.freeze({
    settlementSheet: 'Взаєморозрахунки філій',
    returnedStatus: 'Повернуто',
    lockTimeoutMs: 30000,

    branchCodes: {
      ALT: 'Альтернатива',
      BAB: 'Бабурка'
    }
  });


/**
 * Функція для пункту меню.
 * Користувач вводить лише ID переміщення.
 */
function cancelAcceptedInterbranchTransferById() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Скасувати переміщення',
    'Введіть ID переміщення, наприклад TRF-ALT-BAB-...',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return {
      ok: false,
      cancelledByUser: true
    };
  }

  const transferId = String(
    response.getResponseText() || ''
  ).trim();

  const preview =
    previewInterbranchTransferCancellation_(
      transferId
    );

  if (!preview.readyForCancellation) {
    ui.alert(
      'Скасування заблоковано',
      preview.message,
      ui.ButtonSet.OK
    );

    return preview;
  }

  const confirmation = ui.alert(
    'Підтвердження скасування',
    'Будуть відкочені складські рухи та два ' +
      'взаєморозрахунки ' +
      preview.settlementId +
      '.\n\nПродовжити?',
    ui.ButtonSet.YES_NO
  );

  if (confirmation !== ui.Button.YES) {
    return {
      ok: false,
      cancelledByUser: true,
      preview: preview
    };
  }

  const result =
    executeInterbranchTransferCancellation_(
      transferId
    );

  ui.alert(
    'Готово',
    'Переміщення скасовано.\nID: ' + transferId,
    ui.ButtonSet.OK
  );

  return result;
}


/**
 * Dry-run. Нічого не записує.
 */
function previewInterbranchTransferCancellation_(
  transferId
) {
  try {
    const context =
      getInterbranchTransferCancellationContext_(
        transferId
      );

    return {
      ok: true,
      writesNow: false,

      transferId: context.transferId,
      settlementId: context.settlementId,

      sourceBranch: context.sourceBranchName,
      destinationBranch: context.destinationBranchName,

      quantity: context.quantity,
      settlementAmount: context.settlementAmount,

      readyForCancellation: true,

      message:
        'Переміщення можна безпечно скасувати.'
    };

  } catch (error) {
    return {
      ok: false,
      writesNow: false,

      transferId: String(transferId || '').trim(),

      readyForCancellation: false,

      message: String(error.message || error)
    };
  }
}


/**
 * Робоче скасування.
 * У разі помилки виконує rollback усіх уже
 * проведених у межах запуску змін.
 */
function executeInterbranchTransferCancellation_(
  transferId
) {
  const lock = LockService.getScriptLock();

  const transaction = {
    context: null,
    snapshots: null,

    sourceStockChanged: false,
    destinationStockDeleted: false,

    sourceMovementsDeleted: false,
    destinationMovementsDeleted: false,

    sourceSettlementDeleted: false,
    destinationSettlementDeleted: false,

    sourceJournalChanged: false,
    destinationJournalChanged: false
  };

  try {
    lock.waitLock(
      INTERBRANCH_TRANSFER_CANCELLATION_CONFIG
        .lockTimeoutMs
    );

    const context =
      getInterbranchTransferCancellationContext_(
        transferId
      );

    const actor =
      Session.getActiveUser().getEmail() ||
      'невідомий користувач';

    const executedAt = new Date();

    transaction.context = context;

    transaction.snapshots =
      captureInterbranchCancellationSnapshots_(
        context
      );

    const restoredValues =
      buildRestoredSourceValuesForCancellation_(
        transaction.snapshots.sourceStock.values,
        context.quantity
      );

    context.sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        transaction.snapshots.sourceStock.columnCount
      )
      .setValues([restoredValues]);

    transaction.sourceStockChanged = true;

    const dropdown =
      refreshSourceTransferDropdownForCancellation_(
        context,
        restoredValues
      );

    context.destinationStockSheet.deleteRow(
      context.destinationStockRow
    );

    transaction.destinationStockDeleted = true;

    deleteCancellationRowsDescending_(
      context.sourceMovementSheet,
      transaction.snapshots.sourceMovements
    );

    transaction.sourceMovementsDeleted = true;

    deleteCancellationRowsDescending_(
      context.destinationMovementSheet,
      transaction.snapshots.destinationMovements
    );

    transaction.destinationMovementsDeleted = true;

    context.sourceSettlementSheet.deleteRow(
      context.sourceSettlementRow
    );

    transaction.sourceSettlementDeleted = true;

    context.destinationSettlementSheet.deleteRow(
      context.destinationSettlementRow
    );

    transaction.destinationSettlementDeleted = true;

    const comment =
      'Скасовано переміщення ' +
      context.transferId +
      '. Складські рухи та взаєморозрахунки ' +
      'відкочено.';

    markCancellationJournal_(
      context.sourceJournalSheet,
      context.sourceJournalRow,
      context.sourceJournalHeaders,
      actor,
      executedAt,
      comment
    );

    transaction.sourceJournalChanged = true;

    markCancellationJournal_(
      context.destinationJournalSheet,
      context.destinationJournalRow,
      context.destinationJournalHeaders,
      actor,
      executedAt,
      comment
    );

    transaction.destinationJournalChanged = true;

    SpreadsheetApp.flush();

    const verification =
      verifyInterbranchTransferCancellation_(
        context,
        actor,
        executedAt,
        comment,
        restoredValues
      );

    if (!verification.ok) {
      throw new Error(
        'Після скасування не пройдено перевірку: ' +
          JSON.stringify(verification.checks)
      );
    }

    return {
      ok: true,
      writesNow: true,

      transferId: context.transferId,
      settlementId: context.settlementId,

      sourceBranch: context.sourceBranchName,
      destinationBranch: context.destinationBranchName,

      actor: actor,
      executedAt: executedAt,

      dropdown: dropdown,
      verification: verification,

      rollbackPerformed: false
    };

  } catch (error) {
    const rollback =
      transaction.context && transaction.snapshots
        ? rollbackInterbranchCancellation_(transaction)
        : {
            ok: true,
            errors: []
          };

    if (!rollback.ok) {
      throw new Error(
        'КРИТИЧНА ПОМИЛКА ВІДКАТУ: ' +
          rollback.errors.join(' | ')
      );
    }

    throw error;

  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}


/**
 * Збирає та перевіряє весь набір записів,
 * пов’язаних із конкретним ID переміщення.
 */
function getInterbranchTransferCancellationContext_(
  transferId
) {
  const id = String(transferId || '').trim();

  const parts = id.split('-');

  if (
    parts.length < 5 ||
    parts[0] !== 'TRF'
  ) {
    throw new Error(
      'Некоректний ID переміщення. ' +
      'Очікується формат TRF-ALT-BAB-...'
    );
  }

  const codes =
    INTERBRANCH_TRANSFER_CANCELLATION_CONFIG
      .branchCodes;

  const sourceBranchName = codes[parts[1]];
  const destinationBranchName = codes[parts[2]];

  if (
    !sourceBranchName ||
    !destinationBranchName ||
    sourceBranchName === destinationBranchName
  ) {
    throw new Error(
      'У ID не визначено коректний напрямок ' +
      'між філіями.'
    );
  }

  const branches =
    INTERBRANCH_TRANSFER_CONFIG.branches;

  const sourceBranch =
    branches[sourceBranchName];

  const destinationBranch =
    branches[destinationBranchName];

  if (!sourceBranch || !destinationBranch) {
    throw new Error(
      'Не знайдено налаштування однієї з філій.'
    );
  }

  const sourceSs = SpreadsheetApp.openById(
    sourceBranch.spreadsheetId
  );

  const destinationSs = SpreadsheetApp.openById(
    destinationBranch.spreadsheetId
  );

  const names =
    INTERBRANCH_TRANSFER_CONFIG.sheetNames;

  const settlementName =
    INTERBRANCH_TRANSFER_CANCELLATION_CONFIG
      .settlementSheet;

  const sourceStockSheet =
    requiredCancellationSheet_(
      sourceSs,
      names.stock
    );

  const destinationStockSheet =
    requiredCancellationSheet_(
      destinationSs,
      names.stock
    );

  const sourceMovementSheet =
    requiredCancellationSheet_(
      sourceSs,
      names.movement
    );

  const destinationMovementSheet =
    requiredCancellationSheet_(
      destinationSs,
      names.movement
    );

  const sourceJournalSheet =
    requiredCancellationSheet_(
      sourceSs,
      names.transferJournal
    );

  const destinationJournalSheet =
    requiredCancellationSheet_(
      destinationSs,
      names.transferJournal
    );

  const sourceSettlementSheet =
    requiredCancellationSheet_(
      sourceSs,
      settlementName
    );

  const destinationSettlementSheet =
    requiredCancellationSheet_(
      destinationSs,
      settlementName
    );

  const sourceStockHeaders =
    cancellationHeaders_(sourceStockSheet);

  const destinationStockHeaders =
    cancellationHeaders_(destinationStockSheet);

  const sourceMovementHeaders =
    cancellationHeaders_(sourceMovementSheet);

  const destinationMovementHeaders =
    cancellationHeaders_(destinationMovementSheet);

  const sourceJournalHeaders =
    cancellationHeaders_(sourceJournalSheet);

  const destinationJournalHeaders =
    cancellationHeaders_(destinationJournalSheet);

  const sourceSettlementHeaders =
    cancellationHeaders_(sourceSettlementSheet);

  const destinationSettlementHeaders =
    cancellationHeaders_(destinationSettlementSheet);

  const settlementId = 'SET-' + id;

  const context = {
    transferId: id,
    settlementId: settlementId,

    sourceBranchName: sourceBranchName,
    destinationBranchName: destinationBranchName,

    sourceSs: sourceSs,

    sourceStockSheet: sourceStockSheet,
    destinationStockSheet: destinationStockSheet,

    sourceMovementSheet: sourceMovementSheet,
    destinationMovementSheet: destinationMovementSheet,

    sourceJournalSheet: sourceJournalSheet,
    destinationJournalSheet: destinationJournalSheet,

    sourceSettlementSheet: sourceSettlementSheet,
    destinationSettlementSheet:
      destinationSettlementSheet,

    sourceStockHeaders: sourceStockHeaders,
    destinationStockHeaders:
      destinationStockHeaders,

    sourceJournalHeaders: sourceJournalHeaders,
    destinationJournalHeaders:
      destinationJournalHeaders,

    sourceSettlementHeaders:
      sourceSettlementHeaders,

    destinationSettlementHeaders:
      destinationSettlementHeaders,

    sourceStockRow: findCancellationRows_(
      sourceStockSheet,
      cancellationColumn_(
        sourceStockHeaders,
        'ID переміщення'
      ),
      id
    ),

    destinationStockRow: findCancellationRows_(
      destinationStockSheet,
      cancellationColumn_(
        destinationStockHeaders,
        'ID переміщення'
      ),
      id
    ),

    sourceMovementRows: findCancellationRows_(
      sourceMovementSheet,
      cancellationColumn_(
        sourceMovementHeaders,
        'ID операції'
      ),
      id
    ),

    destinationMovementRows: findCancellationRows_(
      destinationMovementSheet,
      cancellationColumn_(
        destinationMovementHeaders,
        'ID операції'
      ),
      id
    ),

    sourceJournalRow: findCancellationRows_(
      sourceJournalSheet,
      cancellationColumn_(
        sourceJournalHeaders,
        'ID переміщення'
      ),
      id
    ),

    destinationJournalRow: findCancellationRows_(
      destinationJournalSheet,
      cancellationColumn_(
        destinationJournalHeaders,
        'ID переміщення'
      ),
      id
    ),

    sourceSettlementRow: findCancellationRows_(
      sourceSettlementSheet,
      cancellationColumn_(
        sourceSettlementHeaders,
        'ID розрахунку'
      ),
      settlementId
    ),

    destinationSettlementRow: findCancellationRows_(
      destinationSettlementSheet,
      cancellationColumn_(
        destinationSettlementHeaders,
        'ID розрахунку'
      ),
      settlementId
    )
  };

  const allSingle = [
    context.sourceStockRow,
    context.destinationStockRow,
    context.sourceJournalRow,
    context.destinationJournalRow,
    context.sourceSettlementRow,
    context.destinationSettlementRow
  ].every(function(rows) {
    return rows.length === 1;
  });

  if (
    !allSingle ||
    context.sourceMovementRows.length !== 1 ||
    context.destinationMovementRows.length !== 2
  ) {
    throw new Error(
      'Не знайдено повний і однозначний набір ' +
      'записів для цього переміщення.'
    );
  }

  context.sourceStockRow =
    context.sourceStockRow[0];

  context.destinationStockRow =
    context.destinationStockRow[0];

  context.sourceJournalRow =
    context.sourceJournalRow[0];

  context.destinationJournalRow =
    context.destinationJournalRow[0];

  context.sourceSettlementRow =
    context.sourceSettlementRow[0];

  context.destinationSettlementRow =
    context.destinationSettlementRow[0];

  const stock =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const sourceValues =
    sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        sourceStockSheet.getLastColumn()
      )
      .getValues()[0];

  const destinationValues =
    destinationStockSheet
      .getRange(
        context.destinationStockRow,
        1,
        1,
        destinationStockSheet.getLastColumn()
      )
      .getValues()[0];

  context.quantity = cancellationNumber_(
    sourceValues[stock.transferQuantity]
  );

  if (context.quantity <= 0) {
    throw new Error(
      'У джерельній партії не визначена ' +
      'кількість цього переміщення.'
    );
  }

  if (
    cancellationText_(
      destinationValues[stock.transferStatus]
    ) !== 'Прийнято' ||

    cancellationNumber_(
      destinationValues[stock.currentBalance]
    ) !== context.quantity ||

    cancellationNumber_(
      destinationValues[stock.soldOrUsed]
    ) !== 0 ||

    cancellationNumber_(
      destinationValues[stock.transferredToStorage]
    ) !== 0 ||

    cancellationNumber_(
      destinationValues[stock.writtenOff]
    ) !== 0
  ) {
    throw new Error(
      'Скасування заблоковано: отримана партія ' +
      'вже має подальший рух або не перебуває ' +
      'у статусі «Прийнято».'
    );
  }

  const sourceAmountColumn =
    cancellationColumn_(
      sourceSettlementHeaders,
      'Сума нарахування'
    );

  const destinationAmountColumn =
    cancellationColumn_(
      destinationSettlementHeaders,
      'Сума нарахування'
    );

  const sourceAmount = cancellationNumber_(
    sourceSettlementSheet
      .getRange(
        context.sourceSettlementRow,
        sourceAmountColumn
      )
      .getValue()
  );

  const destinationAmount = cancellationNumber_(
    destinationSettlementSheet
      .getRange(
        context.destinationSettlementRow,
        destinationAmountColumn
      )
      .getValue()
  );

  if (
    sourceAmount === 0 ||
    sourceAmount !== destinationAmount
  ) {
    throw new Error(
      'Скасування заблоковано: суми двох ' +
      'взаєморозрахунків не збігаються.'
    );
  }

  context.settlementAmount = sourceAmount;

  return context;
}


function requiredCancellationSheet_(
  spreadsheet,
  name
) {
  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' + name + '».'
    );
  }

  return sheet;
}


function cancellationHeaders_(sheet) {
  return sheet
    .getRange(
      1,
      1,
      1,
      sheet.getLastColumn()
    )
    .getValues()[0];
}


function cancellationColumn_(headers, name) {
  const index = headers.indexOf(name);

  if (index === -1) {
    throw new Error(
      'Не знайдено колонку «' + name + '».'
    );
  }

  return index + 1;
}


function cancellationText_(value) {
  return String(value || '').trim();
}


function cancellationNumber_(value) {
  return Number(value) || 0;
}


function findCancellationRows_(
  sheet,
  column,
  value
) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(
      2,
      column,
      lastRow - 1,
      1
    )
    .getDisplayValues()
    .map(function(row, index) {
      return cancellationText_(row[0]) === value
        ? index + 2
        : 0;
    })
    .filter(Boolean);
}


function captureCancellationRow_(sheet, row) {
  const range = sheet.getRange(
    row,
    1,
    1,
    sheet.getLastColumn()
  );

  return {
    row: row,
    columnCount: sheet.getLastColumn(),

    values: range.getValues()[0],
    backgrounds: range.getBackgrounds()[0],
    fontColors: range.getFontColors()[0],
    fontWeights: range.getFontWeights()[0],
    numberFormats: range.getNumberFormats()[0],

    horizontalAlignments:
      range.getHorizontalAlignments()[0],

    validations: range.getDataValidations()[0]
  };
}


function applyCancellationSnapshot_(
  sheet,
  snapshot
) {
  const range = sheet.getRange(
    snapshot.row,
    1,
    1,
    snapshot.columnCount
  );

  range.setValues([snapshot.values]);
  range.setBackgrounds([snapshot.backgrounds]);
  range.setFontColors([snapshot.fontColors]);
  range.setFontWeights([snapshot.fontWeights]);
  range.setNumberFormats([snapshot.numberFormats]);

  range.setHorizontalAlignments([
    snapshot.horizontalAlignments
  ]);

  range.setDataValidations([snapshot.validations]);
}


function restoreCancellationRow_(
  sheet,
  snapshot
) {
  sheet.insertRowsBefore(snapshot.row, 1);

  applyCancellationSnapshot_(sheet, snapshot);
}


function captureInterbranchCancellationSnapshots_(
  context
) {
  return {
    sourceStock: captureCancellationRow_(
      context.sourceStockSheet,
      context.sourceStockRow
    ),

    destinationStock: captureCancellationRow_(
      context.destinationStockSheet,
      context.destinationStockRow
    ),

    sourceMovements: context.sourceMovementRows.map(
      function(row) {
        return captureCancellationRow_(
          context.sourceMovementSheet,
          row
        );
      }
    ),

    destinationMovements:
      context.destinationMovementRows.map(
        function(row) {
          return captureCancellationRow_(
            context.destinationMovementSheet,
            row
          );
        }
      ),

    sourceJournal: captureCancellationRow_(
      context.sourceJournalSheet,
      context.sourceJournalRow
    ),

    destinationJournal: captureCancellationRow_(
      context.destinationJournalSheet,
      context.destinationJournalRow
    ),

    sourceSettlement: captureCancellationRow_(
      context.sourceSettlementSheet,
      context.sourceSettlementRow
    ),

    destinationSettlement: captureCancellationRow_(
      context.destinationSettlementSheet,
      context.destinationSettlementRow
    )
  };
}


function buildRestoredSourceValuesForCancellation_(
  sourceValues,
  quantity
) {
  const values = sourceValues.slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const tolerance =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .tolerance;

  const restoredBalance =
    cancellationNumber_(
      values[columns.currentBalance]
    ) + quantity;

  const restoredTransferred = Math.max(
    0,
    cancellationNumber_(
      values[columns.transferredToBranches]
    ) - quantity
  );

  values[columns.currentBalance] =
    restoredBalance;

  values[columns.transferredToBranches] =
    restoredTransferred;

  if (restoredBalance <= tolerance) {
    values[columns.lotStatus] = 'Закрита';

  } else if (
    cancellationNumber_(
      values[columns.minimumStock]
    ) > 0 &&
    restoredBalance <= cancellationNumber_(
      values[columns.minimumStock]
    )
  ) {
    values[columns.lotStatus] = 'Низький залишок';

  } else {
    values[columns.lotStatus] = 'Активна';
  }

  [
    columns.transferId,
    columns.sourceBranch,
    columns.destinationBranch,
    columns.transferQuantity,
    columns.transferStatus,
    columns.transferAction,
    columns.transferDateTime,
    columns.transferUser
  ].forEach(function(index) {
    values[index] = '';
  });

  return values;
}


function refreshSourceTransferDropdownForCancellation_(
  context,
  restoredValues
) {
  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const actionCell =
    context.sourceStockSheet.getRange(
      context.sourceStockRow,
      INTERBRANCH_TRANSFER_UI_CONFIG.actionColumn
    );

  if (
    cancellationText_(
      restoredValues[columns.lotStatus]
    ) === 'Закрита'
  ) {
    actionCell.clearContent().clearDataValidations();

    return {
      restored: false,
      reason: 'LOT_CLOSED'
    };
  }

  if (
    typeof refreshInterbranchActionValidationForRow_ ===
    'function'
  ) {
    refreshInterbranchActionValidationForRow_(
      context.sourceSs,
      context.sourceStockRow
    );

    return {
      restored: Boolean(
        actionCell.getDataValidation()
      ),
      reason: 'REFRESHED_BY_UI_HELPER'
    };
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      [
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actions
          .transfer
      ],
      true
    )
    .setAllowInvalid(false)
    .setHelpText('Оберіть «Перемістити».')
    .build();

  actionCell.clearContent().setDataValidation(rule);

  return {
    restored: true,
    reason: 'FALLBACK_RULE'
  };
}


function deleteCancellationRowsDescending_(
  sheet,
  snapshots
) {
  snapshots
    .slice()
    .sort(function(first, second) {
      return second.row - first.row;
    })
    .forEach(function(snapshot) {
      sheet.deleteRow(snapshot.row);
    });
}


function markCancellationJournal_(
  sheet,
  row,
  headers,
  actor,
  executedAt,
  comment
) {
  sheet
    .getRange(
      row,
      cancellationColumn_(headers, 'Статус')
    )
    .setValue(
      INTERBRANCH_TRANSFER_CANCELLATION_CONFIG
        .returnedStatus
    );

  sheet
    .getRange(
      row,
      cancellationColumn_(
        headers,
        'Хто прийняв / повернув'
      )
    )
    .setValue(actor);

  sheet
    .getRange(
      row,
      cancellationColumn_(
        headers,
        'Дата приймання / повернення'
      )
    )
    .setValue(executedAt);

  sheet
    .getRange(
      row,
      cancellationColumn_(headers, 'Коментар')
    )
    .setValue(comment);
}


/**
 * Автоматичний rollback у разі помилки.
 */
function rollbackInterbranchCancellation_(
  transaction
) {
  const context = transaction.context;
  const snapshots = transaction.snapshots;
  const errors = [];

  function safe_(callback) {
    try {
      callback();
    } catch (error) {
      errors.push(String(error.message || error));
    }
  }

  if (transaction.destinationJournalChanged) {
    safe_(function() {
      applyCancellationSnapshot_(
        context.destinationJournalSheet,
        snapshots.destinationJournal
      );
    });
  }

  if (transaction.sourceJournalChanged) {
    safe_(function() {
      applyCancellationSnapshot_(
        context.sourceJournalSheet,
        snapshots.sourceJournal
      );
    });
  }

  if (transaction.destinationSettlementDeleted) {
    safe_(function() {
      restoreCancellationRow_(
        context.destinationSettlementSheet,
        snapshots.destinationSettlement
      );
    });
  }

  if (transaction.sourceSettlementDeleted) {
    safe_(function() {
      restoreCancellationRow_(
        context.sourceSettlementSheet,
        snapshots.sourceSettlement
      );
    });
  }

  if (transaction.destinationMovementsDeleted) {
    snapshots.destinationMovements
      .slice()
      .sort(function(first, second) {
        return first.row - second.row;
      })
      .forEach(function(snapshot) {
        safe_(function() {
          restoreCancellationRow_(
            context.destinationMovementSheet,
            snapshot
          );
        });
      });
  }

  if (transaction.sourceMovementsDeleted) {
    snapshots.sourceMovements
      .slice()
      .sort(function(first, second) {
        return first.row - second.row;
      })
      .forEach(function(snapshot) {
        safe_(function() {
          restoreCancellationRow_(
            context.sourceMovementSheet,
            snapshot
          );
        });
      });
  }

  if (transaction.destinationStockDeleted) {
    safe_(function() {
      restoreCancellationRow_(
        context.destinationStockSheet,
        snapshots.destinationStock
      );
    });
  }

  if (transaction.sourceStockChanged) {
    safe_(function() {
      applyCancellationSnapshot_(
        context.sourceStockSheet,
        snapshots.sourceStock
      );
    });
  }

  SpreadsheetApp.flush();

  return {
    ok: errors.length === 0,
    errors: errors
  };
}


function verifyInterbranchTransferCancellation_(
  context,
  actor,
  executedAt,
  comment,
  restoredValues
) {
  const stock =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns;

  const sourceValues =
    context.sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        context.sourceStockSheet.getLastColumn()
      )
      .getValues()[0];

  const sourceJournal =
    context.sourceJournalSheet
      .getRange(
        context.sourceJournalRow,
        1,
        1,
        context.sourceJournalSheet.getLastColumn()
      )
      .getValues()[0];

  const destinationJournal =
    context.destinationJournalSheet
      .getRange(
        context.destinationJournalRow,
        1,
        1,
        context.destinationJournalSheet.getLastColumn()
      )
      .getValues()[0];

  const sourceDateColumn =
    cancellationColumn_(
      context.sourceJournalHeaders,
      'Дата приймання / повернення'
    ) - 1;

  const destinationDateColumn =
    cancellationColumn_(
      context.destinationJournalHeaders,
      'Дата приймання / повернення'
    ) - 1;

  const checks = {
    sourceTransferCleared:
      !cancellationText_(
        sourceValues[stock.transferId]
      ),

    sourceBalanceRestored:
      cancellationNumber_(
        sourceValues[stock.currentBalance]
      ) === cancellationNumber_(
        restoredValues[stock.currentBalance]
      ),

    sourceTransferredCounterRestored:
      cancellationNumber_(
        sourceValues[stock.transferredToBranches]
      ) === cancellationNumber_(
        restoredValues[stock.transferredToBranches]
      ),

    destinationLotRemoved:
      findCancellationRows_(
        context.destinationStockSheet,
        cancellationColumn_(
          context.destinationStockHeaders,
          'ID переміщення'
        ),
        context.transferId
      ).length === 0,

    sourceMovementRemoved:
      findCancellationRows_(
        context.sourceMovementSheet,
        cancellationColumn_(
          cancellationHeaders_(
            context.sourceMovementSheet
          ),
          'ID операції'
        ),
        context.transferId
      ).length === 0,

    destinationMovementsRemoved:
      findCancellationRows_(
        context.destinationMovementSheet,
        cancellationColumn_(
          cancellationHeaders_(
            context.destinationMovementSheet
          ),
          'ID операції'
        ),
        context.transferId
      ).length === 0,

    sourceSettlementRemoved:
      findCancellationRows_(
        context.sourceSettlementSheet,
        cancellationColumn_(
          context.sourceSettlementHeaders,
          'ID розрахунку'
        ),
        context.settlementId
      ).length === 0,

    destinationSettlementRemoved:
      findCancellationRows_(
        context.destinationSettlementSheet,
        cancellationColumn_(
          context.destinationSettlementHeaders,
          'ID розрахунку'
        ),
        context.settlementId
      ).length === 0,

    sourceJournalMarked:
      cancellationText_(
        sourceJournal[
          cancellationColumn_(
            context.sourceJournalHeaders,
            'Статус'
          ) - 1
        ]
      ) ===
      INTERBRANCH_TRANSFER_CANCELLATION_CONFIG
        .returnedStatus,

    destinationJournalMarked:
      cancellationText_(
        destinationJournal[
          cancellationColumn_(
            context.destinationJournalHeaders,
            'Статус'
          ) - 1
        ]
      ) ===
      INTERBRANCH_TRANSFER_CANCELLATION_CONFIG
        .returnedStatus,

    sourceJournalActorMarked:
      cancellationText_(
        sourceJournal[
          cancellationColumn_(
            context.sourceJournalHeaders,
            'Хто прийняв / повернув'
          ) - 1
        ]
      ) === actor,

    destinationJournalActorMarked:
      cancellationText_(
        destinationJournal[
          cancellationColumn_(
            context.destinationJournalHeaders,
            'Хто прийняв / повернув'
          ) - 1
        ]
      ) === actor,

    sourceJournalDateMarked:
      sourceJournal[sourceDateColumn] instanceof Date &&
      sourceJournal[sourceDateColumn].getTime() ===
        executedAt.getTime(),

    destinationJournalDateMarked:
      destinationJournal[destinationDateColumn] instanceof
        Date,

    sourceJournalCommentMarked:
      cancellationText_(
        sourceJournal[
          cancellationColumn_(
            context.sourceJournalHeaders,
            'Коментар'
          ) - 1
        ]
      ) === comment,

    destinationJournalCommentMarked:
      cancellationText_(
        destinationJournal[
          cancellationColumn_(
            context.destinationJournalHeaders,
            'Коментар'
          ) - 1
        ]
      ) === comment
  };

  return {
    ok: Object.keys(checks).every(function(key) {
      return checks[key] === true;
    }),

    checks: checks
  };
}
function cancelAcceptedInterbranchTransferByKnownId_(
  transferId
) {
  const ui = SpreadsheetApp.getUi();

  const id = String(transferId || '').trim();

  const preview =
    previewInterbranchTransferCancellation_(id);

  if (!preview.readyForCancellation) {
    throw new Error(preview.message);
  }

  const confirmation = ui.alert(
    'Підтвердження скасування',
    'ID: ' + id +
      '\n\nБудуть відкочені складські рухи та ' +
      'два взаєморозрахунки ' +
      preview.settlementId +
      '.\n\nПродовжити?',
    ui.ButtonSet.YES_NO
  );

  if (confirmation !== ui.Button.YES) {
    return {
      ok: false,
      writesNow: false,
      cancelledByUser: true,
      transferId: id
    };
  }

  const result =
    executeInterbranchTransferCancellation_(id);

  ui.alert(
    'Переміщення скасовано',
    'ID: ' + id,
    ui.ButtonSet.OK
  );

  return result;
}