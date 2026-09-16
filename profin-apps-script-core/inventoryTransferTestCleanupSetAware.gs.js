const INTERBRANCH_SET_AWARE_CLEANUP_20260824 =
  Object.freeze({
    transferId:
      'TRF-ALT-BAB-20260824-171809-A9324D',

    sourceBranch: 'Альтернатива',
    destinationBranch: 'Бабурка',

    settlementSheet: 'Взаєморозрахунки філій',
    expectedAmount: 60,
    lockTimeoutMs: 30000,

    returnedStatus: 'Повернуто',

    comment:
      'Тестове переміщення очищено контрольованим сценарієм. ' +
      'Складські рухи та взаєморозрахунки відкочено.'
  });


function getSetAwareCleanupContext_20260824() {
  const config =
    INTERBRANCH_SET_AWARE_CLEANUP_20260824;

  const preview =
    previewSetAwareTestTransferCleanup_20260824();

  if (!preview.readyForCleanup) {
    throw new Error(
      'Очищення заблоковано: preview не пройдено.'
    );
  }

  const sourceBranch =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[config.sourceBranch];

  const destinationBranch =
    INTERBRANCH_TRANSFER_CONFIG
      .branches[config.destinationBranch];

  const sourceSs = SpreadsheetApp.openById(
    sourceBranch.spreadsheetId
  );

  const destinationSs = SpreadsheetApp.openById(
    destinationBranch.spreadsheetId
  );

  const names =
    INTERBRANCH_TRANSFER_CONFIG.sheetNames;

  function requiredSheet_(spreadsheet, name) {
    const sheet = spreadsheet.getSheetByName(name);

    if (!sheet) {
      throw new Error(
        'Не знайдено лист «' + name + '».'
      );
    }

    return sheet;
  }

  function headers_(sheet) {
    return sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
  }

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index + 1;
  }

  function text_(value) {
    return String(value || '').trim();
  }

  function findRows_(sheet, column, value) {
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    return sheet
      .getRange(2, column, lastRow - 1, 1)
      .getDisplayValues()
      .map(function(row, index) {
        return text_(row[0]) === value
          ? index + 2
          : 0;
      })
      .filter(Boolean);
  }

  const sourceStockSheet =
    requiredSheet_(sourceSs, names.stock);

  const destinationStockSheet =
    requiredSheet_(destinationSs, names.stock);

  const sourceMovementSheet =
    requiredSheet_(sourceSs, names.movement);

  const destinationMovementSheet =
    requiredSheet_(destinationSs, names.movement);

  const sourceJournalSheet =
    requiredSheet_(sourceSs, names.transferJournal);

  const destinationJournalSheet =
    requiredSheet_(destinationSs, names.transferJournal);

  const sourceSettlementSheet =
    requiredSheet_(sourceSs, config.settlementSheet);

  const destinationSettlementSheet =
    requiredSheet_(destinationSs, config.settlementSheet);

  const settlementId = 'SET-' + config.transferId;

  const sourceStockHeaders = headers_(sourceStockSheet);
  const destinationStockHeaders =
    headers_(destinationStockSheet);

  const sourceMovementHeaders =
    headers_(sourceMovementSheet);

  const destinationMovementHeaders =
    headers_(destinationMovementSheet);

  const sourceJournalHeaders =
    headers_(sourceJournalSheet);

  const destinationJournalHeaders =
    headers_(destinationJournalSheet);

  const settlementHeaders =
    headers_(sourceSettlementSheet);

  const sourceStockTransferColumn = column_(
    sourceStockHeaders,
    'ID переміщення'
  );

  const destinationStockTransferColumn = column_(
    destinationStockHeaders,
    'ID переміщення'
  );

  const sourceMovementOperationColumn = column_(
    sourceMovementHeaders,
    'ID операції'
  );

  const destinationMovementOperationColumn = column_(
    destinationMovementHeaders,
    'ID операції'
  );

  const sourceJournalTransferColumn = column_(
    sourceJournalHeaders,
    'ID переміщення'
  );

  const destinationJournalTransferColumn = column_(
    destinationJournalHeaders,
    'ID переміщення'
  );

  const settlementIdColumn = column_(
    settlementHeaders,
    'ID розрахунку'
  );

  const context = {
    config: config,
    settlementId: settlementId,

    sourceSs: sourceSs,
    destinationSs: destinationSs,

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

    sourceStockRow: findRows_(
      sourceStockSheet,
      sourceStockTransferColumn,
      config.transferId
    )[0],

    destinationStockRow: findRows_(
      destinationStockSheet,
      destinationStockTransferColumn,
      config.transferId
    )[0],

    sourceMovementRows: findRows_(
      sourceMovementSheet,
      sourceMovementOperationColumn,
      config.transferId
    ),

    destinationMovementRows: findRows_(
      destinationMovementSheet,
      destinationMovementOperationColumn,
      config.transferId
    ),

    sourceJournalRow: findRows_(
      sourceJournalSheet,
      sourceJournalTransferColumn,
      config.transferId
    )[0],

    destinationJournalRow: findRows_(
      destinationJournalSheet,
      destinationJournalTransferColumn,
      config.transferId
    )[0],

    sourceSettlementRow: findRows_(
      sourceSettlementSheet,
      settlementIdColumn,
      settlementId
    )[0],

    destinationSettlementRow: findRows_(
      destinationSettlementSheet,
      settlementIdColumn,
      settlementId
    )[0]
  };

  const required = [
    context.sourceStockRow,
    context.destinationStockRow,
    context.sourceJournalRow,
    context.destinationJournalRow,
    context.sourceSettlementRow,
    context.destinationSettlementRow
  ];

  if (
    required.some(function(value) {
      return !value;
    }) ||
    context.sourceMovementRows.length !== 1 ||
    context.destinationMovementRows.length !== 2
  ) {
    throw new Error(
      'Контекст очищення неповний або змінився після preview.'
    );
  }

  return context;
}


function captureSetAwareCleanupRow_(sheet, row) {
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


function applySetAwareCleanupSnapshot_(sheet, snapshot) {
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


function restoreDeletedSetAwareCleanupRow_(
  sheet,
  snapshot
) {
  sheet.insertRowsBefore(snapshot.row, 1);

  applySetAwareCleanupSnapshot_(sheet, snapshot);
}


function captureSetAwareCleanupSnapshots_(context) {
  return {
    sourceStock: captureSetAwareCleanupRow_(
      context.sourceStockSheet,
      context.sourceStockRow
    ),

    destinationStock: captureSetAwareCleanupRow_(
      context.destinationStockSheet,
      context.destinationStockRow
    ),

    sourceMovements: context.sourceMovementRows.map(
      function(row) {
        return captureSetAwareCleanupRow_(
          context.sourceMovementSheet,
          row
        );
      }
    ),

    destinationMovements:
      context.destinationMovementRows.map(
        function(row) {
          return captureSetAwareCleanupRow_(
            context.destinationMovementSheet,
            row
          );
        }
      ),

    sourceJournal: captureSetAwareCleanupRow_(
      context.sourceJournalSheet,
      context.sourceJournalRow
    ),

    destinationJournal: captureSetAwareCleanupRow_(
      context.destinationJournalSheet,
      context.destinationJournalRow
    ),

    sourceSettlement: captureSetAwareCleanupRow_(
      context.sourceSettlementSheet,
      context.sourceSettlementRow
    ),

    destinationSettlement: captureSetAwareCleanupRow_(
      context.destinationSettlementSheet,
      context.destinationSettlementRow
    )
  };
}


function buildRestoredSourceValues_20260824(
  sourceValues,
  quantity
) {
  const values = sourceValues.slice();

  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG.stockColumns;

  const tolerance =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG.tolerance;

  const restoredBalance =
    (Number(values[columns.currentBalance]) || 0) +
    quantity;

  const restoredTransferred = Math.max(
    0,
    (Number(values[columns.transferredToBranches]) || 0) -
      quantity
  );

  values[columns.currentBalance] = restoredBalance;
  values[columns.transferredToBranches] =
    restoredTransferred;

  if (restoredBalance <= tolerance) {
    values[columns.lotStatus] = 'Закрита';
  } else if (
    Number(values[columns.minimumStock]) > 0 &&
    restoredBalance <= Number(values[columns.minimumStock])
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


function markSetAwareCleanupJournal_(
  sheet,
  row,
  headers,
  config,
  actor,
  executedAt
) {
  function column_(name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index + 1;
  }

  sheet.getRange(row, column_('Статус')).setValue(
    config.returnedStatus
  );

  sheet
    .getRange(
      row,
      column_('Хто прийняв / повернув')
    )
    .setValue(actor);

  sheet
    .getRange(
      row,
      column_('Дата приймання / повернення')
    )
    .setValue(executedAt);

  sheet.getRange(row, column_('Коментар')).setValue(
    config.comment
  );
}


function refreshSourceTransferDropdown_20260824(
  context,
  restoredValues
) {
  const columns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG.stockColumns;

  const status = String(
    restoredValues[columns.lotStatus] || ''
  ).trim();

  const actionCell =
    context.sourceStockSheet.getRange(
      context.sourceStockRow,
      INTERBRANCH_TRANSFER_UI_CONFIG.actionColumn
    );

  if (status === 'Закрита') {
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
      restored: Boolean(actionCell.getDataValidation()),
      reason: 'REFRESHED_BY_UI_HELPER'
    };
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      [INTERBRANCH_TRANSFER_UI_CONFIG.actions.transfer],
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


function deleteSnapshotsDescending_(
  sheet,
  snapshots,
  deleted
) {
  snapshots
    .slice()
    .sort(function(first, second) {
      return second.row - first.row;
    })
    .forEach(function(snapshot) {
      sheet.deleteRow(snapshot.row);
      deleted.push(snapshot);
    });
}


function restoreSetAwareCleanup_(
  transaction
) {
  const errors = [];
  const context = transaction.context;
  const snapshots = transaction.snapshots;

  function safe_(callback) {
    try {
      callback();
    } catch (error) {
      errors.push(String(error.message || error));
    }
  }

  if (transaction.destinationJournalChanged) {
    safe_(function() {
      applySetAwareCleanupSnapshot_(
        context.destinationJournalSheet,
        snapshots.destinationJournal
      );
    });
  }

  if (transaction.sourceJournalChanged) {
    safe_(function() {
      applySetAwareCleanupSnapshot_(
        context.sourceJournalSheet,
        snapshots.sourceJournal
      );
    });
  }

  if (transaction.destinationSettlementDeleted) {
    safe_(function() {
      restoreDeletedSetAwareCleanupRow_(
        context.destinationSettlementSheet,
        snapshots.destinationSettlement
      );
    });
  }

  if (transaction.sourceSettlementDeleted) {
    safe_(function() {
      restoreDeletedSetAwareCleanupRow_(
        context.sourceSettlementSheet,
        snapshots.sourceSettlement
      );
    });
  }

  transaction.deletedDestinationMovements
    .slice()
    .sort(function(first, second) {
      return first.row - second.row;
    })
    .forEach(function(snapshot) {
      safe_(function() {
        restoreDeletedSetAwareCleanupRow_(
          context.destinationMovementSheet,
          snapshot
        );
      });
    });

  transaction.deletedSourceMovements
    .slice()
    .sort(function(first, second) {
      return first.row - second.row;
    })
    .forEach(function(snapshot) {
      safe_(function() {
        restoreDeletedSetAwareCleanupRow_(
          context.sourceMovementSheet,
          snapshot
        );
      });
    });

  if (transaction.destinationStockDeleted) {
    safe_(function() {
      restoreDeletedSetAwareCleanupRow_(
        context.destinationStockSheet,
        snapshots.destinationStock
      );
    });
  }

  if (transaction.sourceStockChanged) {
    safe_(function() {
      applySetAwareCleanupSnapshot_(
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


function verifySetAwareCleanup_20260824(
  context,
  actor,
  expectedSourceBalance
) {
  const config = context.config;

  function text_(value) {
    return String(value || '').trim();
  }

  function findRows_(sheet, column, value) {
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    return sheet
      .getRange(2, column, lastRow - 1, 1)
      .getDisplayValues()
      .map(function(row, index) {
        return text_(row[0]) === value
          ? index + 2
          : 0;
      })
      .filter(Boolean);
  }

  function column_(headers, name) {
    return headers.indexOf(name) + 1;
  }

  const stockColumns =
    INTERBRANCH_TRANSFER_PLANNER_CONFIG.stockColumns;

  const sourceStockValues =
    context.sourceStockSheet
      .getRange(
        context.sourceStockRow,
        1,
        1,
        context.sourceStockSheet.getLastColumn()
      )
      .getValues()[0];

  const sourceStockTransferColumn = column_(
    context.sourceStockHeaders,
    'ID переміщення'
  );

  const destinationStockTransferColumn = column_(
    context.destinationStockHeaders,
    'ID переміщення'
  );

  const sourceJournalStatusColumn = column_(
    context.sourceJournalHeaders,
    'Статус'
  );

  const sourceJournalUserColumn = column_(
    context.sourceJournalHeaders,
    'Хто прийняв / повернув'
  );

  const destinationJournalStatusColumn = column_(
    context.destinationJournalHeaders,
    'Статус'
  );

  const destinationJournalUserColumn = column_(
    context.destinationJournalHeaders,
    'Хто прийняв / повернув'
  );

  const checks = {
    sourceTransferCleared:
      !text_(
        sourceStockValues[
          stockColumns.transferId
        ]
      ),

    sourceBalanceRestored:
  Number(
    sourceStockValues[
      stockColumns.currentBalance
    ]
  ) === expectedSourceBalance,

    sourceTransferredCounterRestored:
      Number(
        sourceStockValues[
          stockColumns.transferredToBranches
        ]
      ) === 0,

    destinationLotRemoved:
      findRows_(
        context.destinationStockSheet,
        destinationStockTransferColumn,
        config.transferId
      ).length === 0,

    sourceMovementRemoved:
      findRows_(
        context.sourceMovementSheet,
        2,
        config.transferId
      ).length === 0,

    destinationMovementsRemoved:
      findRows_(
        context.destinationMovementSheet,
        2,
        config.transferId
      ).length === 0,

    alternativeSettlementRemoved:
      findRows_(
        context.sourceSettlementSheet,
        1,
        context.settlementId
      ).length === 0,

    baburkaSettlementRemoved:
      findRows_(
        context.destinationSettlementSheet,
        1,
        context.settlementId
      ).length === 0,

    sourceJournalMarkedReturned:
      text_(
        context.sourceJournalSheet
          .getRange(
            context.sourceJournalRow,
            sourceJournalStatusColumn
          )
          .getValue()
      ) === config.returnedStatus,

    destinationJournalMarkedReturned:
      text_(
        context.destinationJournalSheet
          .getRange(
            context.destinationJournalRow,
            destinationJournalStatusColumn
          )
          .getValue()
      ) === config.returnedStatus,

    sourceJournalActorMarked:
      text_(
        context.sourceJournalSheet
          .getRange(
            context.sourceJournalRow,
            sourceJournalUserColumn
          )
          .getValue()
      ) === actor,

    destinationJournalActorMarked:
      text_(
        context.destinationJournalSheet
          .getRange(
            context.destinationJournalRow,
            destinationJournalUserColumn
          )
          .getValue()
      ) === actor
  };

  return {
    ok: Object.keys(checks).every(function(key) {
      return checks[key] === true;
    }),
    checks: checks
  };
}


function executeSetAwareTestTransferCleanupCore_20260824(
  options
) {
  const lock = LockService.getScriptLock();
  const transaction = {
    context: null,
    snapshots: null,
    sourceStockChanged: false,
    destinationStockDeleted: false,
    deletedSourceMovements: [],
    deletedDestinationMovements: [],
    sourceSettlementDeleted: false,
    destinationSettlementDeleted: false,
    sourceJournalChanged: false,
    destinationJournalChanged: false
  };

  try {
    lock.waitLock(
      INTERBRANCH_SET_AWARE_CLEANUP_20260824
        .lockTimeoutMs
    );

    const context =
      getSetAwareCleanupContext_20260824();

    const actor =
      Session.getActiveUser().getEmail() ||
      'невідомий користувач';

    const executedAt = new Date();

    transaction.context = context;
    transaction.snapshots =
      captureSetAwareCleanupSnapshots_(context);

    const restoredValues =
      buildRestoredSourceValues_20260824(
        transaction.snapshots.sourceStock.values,
        1
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
      refreshSourceTransferDropdown_20260824(
        context,
        restoredValues
      );
   const expectedSourceBalance = Number(
  restoredValues[
    INTERBRANCH_TRANSFER_PLANNER_CONFIG
      .stockColumns
      .currentBalance
  ]
) || 0;
    context.destinationStockSheet.deleteRow(
      context.destinationStockRow
    );

    transaction.destinationStockDeleted = true;

    deleteSnapshotsDescending_(
      context.sourceMovementSheet,
      transaction.snapshots.sourceMovements,
      transaction.deletedSourceMovements
    );

    deleteSnapshotsDescending_(
      context.destinationMovementSheet,
      transaction.snapshots.destinationMovements,
      transaction.deletedDestinationMovements
    );

    context.sourceSettlementSheet.deleteRow(
      context.sourceSettlementRow
    );

    transaction.sourceSettlementDeleted = true;

    context.destinationSettlementSheet.deleteRow(
      context.destinationSettlementRow
    );

    transaction.destinationSettlementDeleted = true;

    markSetAwareCleanupJournal_(
      context.sourceJournalSheet,
      context.sourceJournalRow,
      context.sourceJournalHeaders,
      context.config,
      actor,
      executedAt
    );

    transaction.sourceJournalChanged = true;

    markSetAwareCleanupJournal_(
      context.destinationJournalSheet,
      context.destinationJournalRow,
      context.destinationJournalHeaders,
      context.config,
      actor,
      executedAt
    );

    transaction.destinationJournalChanged = true;

    SpreadsheetApp.flush();

    if (options && options.forceFailure) {
      throw new Error(
        'ТЕСТОВА ПОМИЛКА: примусовий rollback.'
      );
    }

    const verification =
  verifySetAwareCleanup_20260824(
    context,
    actor,
    expectedSourceBalance
  );

    if (!verification.ok) {
      throw new Error(
        'Після очищення не пройдено перевірку: ' +
        JSON.stringify(verification.checks)
      );
    }

    return {
      ok: true,
      test: 'executeSetAwareTestTransferCleanup_20260824',
      writesNow: true,
      transferId: context.config.transferId,
      settlementId: context.settlementId,
      actor: actor,
      executedAt: executedAt,
      dropdown: dropdown,
      verification: verification,
      rollbackPerformed: false
    };

  } catch (error) {
    const rollback =
      transaction.context && transaction.snapshots
        ? restoreSetAwareCleanup_(transaction)
        : { ok: true, errors: [] };

    if (!rollback.ok) {
      throw new Error(
        'КРИТИЧНА ПОМИЛКА ВІДКАТУ: ' +
        rollback.errors.join(' | ')
      );
    }

    if (options && options.forceFailure) {
      return {
        ok: true,
        test:
          'testSetAwareTestTransferCleanupRollback_20260824',
        writesNow: false,
        rollbackPerformed: true,
        expectedError: String(error.message || error)
      };
    }

    throw error;

  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}


function testSetAwareTestTransferCleanupRollback_20260824() {
  const result =
    executeSetAwareTestTransferCleanupCore_20260824({
      forceFailure: true
    });

  const lifecycleAudit =
    auditAcceptedTestTransfer_20260824();

  const cleanupPreview =
    previewSetAwareTestTransferCleanup_20260824();

  result.postRollbackChecks = {
    lifecycleFullyRestored:
      lifecycleAudit.readyForSetAwareCleanup === true,

    cleanupStillReady:
      cleanupPreview.readyForCleanup === true
  };

  result.ok = Object.keys(result.postRollbackChecks)
    .every(function(key) {
      return result.postRollbackChecks[key] === true;
    });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error(
      'Після примусового rollback не відновлено ' +
      'повний стан тестового переміщення.'
    );
  }

  return result;
}


function executeSetAwareTestTransferCleanup_20260824() {
  const result =
    executeSetAwareTestTransferCleanupCore_20260824();

  console.log(JSON.stringify(result, null, 2));
  return result;
}