/**
 * ORPHAN ROLLBACK — КРОК 3, КОНТРОЛЬОВАНЕ ВИКОНАННЯ
 *
 * Залежність: у проєкті має залишатися orphanRollbackPlanV2.gs.
 *
 * Порядок:
 * 1. Із writeEnabled:false запустити
 *    previewControlledOrphanRollbackV3().
 * 2. Перевірити EXECUTION_GATE.
 * 3. Лише після підтвердження змінити writeEnabled на true.
 * 4. Запустити executeApprovedOrphanRollbackV3().
 *
 * Скрипт:
 * — працює з точним білим списком;
 * — повторно звіряє dry-run V2;
 * — створює прихований резервний лист;
 * — не видаляє фізичні рядки;
 * — автоматично відновлює дані за будь-якої помилки.
 */

const ORPHAN_ROLLBACK_EXEC_V3_CONFIG = Object.freeze({
  writeEnabled: false,
  manualRestoreEnabled: false,

  propertyKey: 'ORPHAN_ROLLBACK_EXEC_V3_LAST_RUN',
  backupPrefix: '_ORPHAN_RB_V3_',
  tolerance: 0.000001,

  branches: Object.freeze({
    alternative: Object.freeze({
      label: 'Альтернатива',

      operations: Object.freeze([
        opV3_(
          'L-20260723-154',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [],
          [],
          [18],
          [],
          []
        ),
        opV3_(
          'VAC-20260602-361',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [4],
          [],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260603-666',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [2],
          [],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260604-614',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [3],
          [],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260725-932',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [31],
          [],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260805-956',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [56],
          [93],
          [67],
          [],
          []
        )
      ]),

      stockChanges: Object.freeze([
        stockV3_(
          'L-20260722-458-LOT-1',
          31,
          false,
          [9, 0, 0, 2, 10, 'Низький залишок'],
          [8, 0, 0, 3, 10, 'Низький залишок'],
          4
        )
      ]),

      protected: Object.freeze([])
    }),

    baburka: Object.freeze({
      label: 'Бабурка',

      operations: Object.freeze([
        opV3_(
          'L-20260723-829',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [],
          [],
          [2],
          [],
          []
        ),
        opV3_(
          'L-20260728-233',
          'ROLLBACK_ORPHAN_RECEIPT',
          [],
          [],
          [29],
          [33],
          []
        ),
        opV3_(
          'L-20260728-888',
          'ROLLBACK_ORPHAN_RECEIPT',
          [],
          [],
          [27],
          [29],
          []
        ),
        opV3_(
          'L-20260806-563',
          'ROLLBACK_ORPHAN_RECEIPT',
          [],
          [],
          [57],
          [41],
          []
        ),
        opV3_(
          'TRF-ALT-BAB-20260811-162227-87E327',
          'CLEAR_RETURNED_TRANSFER_PLACEHOLDER',
          [],
          [],
          [94],
          [8],
          []
        ),
        opV3_(
          'TRF-ALT-BAB-20260811-165147-1743BD',
          'CLEAR_RETURNED_TRANSFER_PLACEHOLDER',
          [],
          [],
          [95],
          [9],
          []
        ),
        opV3_(
          'VAC-20260612-414',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [9],
          [],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260624-849',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [18],
          [20],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260713-977',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [40],
          [48],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260717-221',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [108],
          [60],
          [],
          [],
          []
        ),
        opV3_(
          'VAC-20260806-711',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [77],
          [89],
          [54],
          [],
          []
        ),
        opV3_(
          'VAC-20260811-260',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [87],
          [],
          [90, 91],
          [],
          []
        ),
        opV3_(
          'VAC-20260811-313',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [],
          [],
          [89],
          [],
          []
        ),
        opV3_(
          'VAC-20260811-351',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [86],
          [],
          [87, 88],
          [],
          []
        ),
        opV3_(
          'VAC-20260811-772',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [85],
          [],
          [86],
          [],
          []
        ),
        opV3_(
          'VAC-20260811-796',
          'ROLLBACK_ORPHAN_DERIVATIVES',
          [88],
          [],
          [92, 93],
          [],
          []
        )
      ]),

      stockChanges: Object.freeze([
        stockV3_(
          'L-20260723-256-LOT-1',
          25,
          false,
          [3, 0, 0, 4, 10, 'Низький залишок'],
          [2, 0, 0, 5, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'L-20260723-396-LOT-1',
          39,
          false,
          [4, 1, 0, 1, 10, 'Низький залишок'],
          [4, 0, 0, 2, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'L-20260723-410-LOT-1',
          11,
          false,
          [1, 0, 0, 0, 10, 'Закрита'],
          [0, 0, 0, 1, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'L-20260728-233-LOT-1',
          33,
          true,
          [0, 0, 0, 3, 10, 'Низький залишок'],
          [0, 0, 0, 3, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'L-20260728-888-LOT-1',
          29,
          true,
          [0, 0, 0, 1, 10, 'Низький залишок'],
          [0, 0, 0, 1, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'L-20260806-563-LOT-1',
          41,
          true,
          [1, 0, 0, 0, 10, 'Закрита'],
          [0, 0, 0, 1, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'TRF-ALT-BAB-20260810-124352-800C5E-LOT-IN',
          16,
          false,
          [2, 0, 0, 0, 10, 'Закрита'],
          [1, 0, 0, 1, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'TRF-ALT-BAB-20260811-131325-FA9A92-LOT-IN',
          40,
          false,
          [2, 0, 0, 0, 10, 'Закрита'],
          [0, 0, 0, 2, 10, 'Низький залишок'],
          0
        ),
        stockV3_(
          'TRF-ALT-BAB-20260811-162227-87E327-LOT-IN',
          8,
          true,
          [0, 0, 0, 0, 10, 'Заблокована'],
          [0, 0, 0, 0, 10, 'Закрита'],
          0
        ),
        stockV3_(
          'TRF-ALT-BAB-20260811-165147-1743BD-LOT-IN',
          9,
          true,
          [0, 0, 0, 0, 10, 'Заблокована'],
          [0, 0, 0, 0, 10, 'Закрита'],
          0
        )
      ]),

      protected: Object.freeze([
        protectedV3_('L-20260723-472', [5], [58]),
        protectedV3_('L-20260728-667', [19], [28]),
        protectedV3_('L-20260806-541', [4], [56])
      ])
    })
  })
});


function previewControlledOrphanRollbackV3() {
  assertOrphanRollbackV3Dependency_();

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const expected = resolveOrphanRollbackV3Branch_(
    spreadsheet.getName()
  );

  const plan = previewApprovedOrphanRollbackPlanV2();
  const errors = validateOrphanRollbackV3Plan_(
    plan,
    expected
  );

  const result = {
    ok: errors.length === 0,
    test: 'previewControlledOrphanRollbackV3',
    writesNow: false,
    branch: expected.label,
    operationCount: expected.operations.length,
    stockChangeCount: expected.stockChanges.length,
    protectedOperationCount: expected.protected.length,
    status: errors.length === 0
      ? 'READY_FOR_CONTROLLED_EXECUTION'
      : 'BLOCKED',
    writeEnabled:
      ORPHAN_ROLLBACK_EXEC_V3_CONFIG.writeEnabled,
    errors: errors
  };

  Logger.log(
    'EXECUTION_GATE: ' +
    JSON.stringify(result)
  );

  errors.forEach(function(error) {
    Logger.log('GATE_ERROR: ' + error);
  });

  return result;
}


function executeApprovedOrphanRollbackV3() {
  const config = ORPHAN_ROLLBACK_EXEC_V3_CONFIG;

  if (!config.writeEnabled) {
    const disabled = {
      ok: false,
      writesNow: false,
      status: 'WRITE_DISABLED',
      instruction:
        'Спочатку виконайте previewControlledOrphanRollbackV3().'
    };

    Logger.log(
      'RESULT_V3: ' +
      JSON.stringify(disabled)
    );

    return disabled;
  }

  assertOrphanRollbackV3Dependency_();

  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Не вдалося отримати блокування документа за 30 секунд.'
    );
  }

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const properties =
    PropertiesService.getDocumentProperties();

  let backupSheet = null;
  let snapshotReady = false;

  try {
    const previous =
      readOrphanRollbackV3Property_(properties);

    if (
      previous &&
      previous.status === 'SUCCESS'
    ) {
      const alreadyDone = {
        ok: true,
        writesNow: false,
        status: 'ALREADY_EXECUTED',
        branch: previous.branch,
        backupSheet: previous.backupSheet,
        completedAt: previous.completedAt
      };

      Logger.log(
        'RESULT_V3: ' +
        JSON.stringify(alreadyDone)
      );

      return alreadyDone;
    }

    const expected =
      resolveOrphanRollbackV3Branch_(
        spreadsheet.getName()
      );

    const plan =
      previewApprovedOrphanRollbackPlanV2();

    const errors =
      validateOrphanRollbackV3Plan_(
        plan,
        expected
      );

    if (errors.length) {
      throw new Error(
        'Виконання заблоковано: ' +
        errors.join(' | ')
      );
    }

    const sheets =
      getOrphanRollbackV3Sheets_(spreadsheet);

    assertOrphanRollbackV3LiveRows_(
      plan,
      expected,
      sheets
    );

    const protectedBefore =
      captureOrphanRollbackV3Protected_(
        expected,
        sheets
      );

    const targets =
      collectOrphanRollbackV3SnapshotTargets_(
        plan,
        sheets
      );

    backupSheet =
      createOrphanRollbackV3Snapshot_(
        spreadsheet,
        expected.label,
        targets
      );

    snapshotReady = true;

    writeOrphanRollbackV3Property_(
      properties,
      {
        status: 'IN_PROGRESS',
        branch: expected.label,
        backupSheet: backupSheet.getName(),
        startedAt: new Date().toISOString()
      }
    );

    applyOrphanRollbackV3_(
      plan,
      sheets
    );

    SpreadsheetApp.flush();

    const verificationErrors =
      verifyOrphanRollbackV3Result_(
        plan,
        expected,
        sheets,
        protectedBefore
      );

    if (verificationErrors.length) {
      throw new Error(
        'Післяопераційна перевірка не пройдена: ' +
        verificationErrors.join(' | ')
      );
    }

    const completedAt =
      new Date().toISOString();

    markOrphanRollbackV3Backup_(
      backupSheet,
      'SUCCESS',
      completedAt
    );

    writeOrphanRollbackV3Property_(
      properties,
      {
        status: 'SUCCESS',
        branch: expected.label,
        backupSheet: backupSheet.getName(),
        completedAt: completedAt,
        operationCount: plan.operations.length
      }
    );

    const result = {
      ok: true,
      writesNow: true,
      status: 'ROLLED_BACK',
      branch: expected.label,
      operationCount: plan.operations.length,
      stockChangeCount: plan.stockChanges.length,
      protectedOperationCount:
        expected.protected.length,
      backupSheet: backupSheet.getName(),
      verificationPassed: true
    };

    Logger.log(
      'RESULT_V3: ' +
      JSON.stringify(result)
    );

    return result;

  } catch (error) {
    let restoreMessage =
      'Знімок ще не був створений; робочі дані не змінювалися.';

    if (
      snapshotReady &&
      backupSheet
    ) {
      try {
        restoreOrphanRollbackV3Snapshot_(
          spreadsheet,
          backupSheet
        );

        SpreadsheetApp.flush();

        const restoredAt =
          new Date().toISOString();

        markOrphanRollbackV3Backup_(
          backupSheet,
          'AUTO_ROLLED_BACK',
          restoredAt
        );

        writeOrphanRollbackV3Property_(
          properties,
          {
            status: 'AUTO_ROLLED_BACK',
            backupSheet: backupSheet.getName(),
            restoredAt: restoredAt,
            error: String(
              error && error.message
                ? error.message
                : error
            )
          }
        );

        restoreMessage =
          'Автоматичне відновлення зі знімка виконано.';

      } catch (restoreError) {
        restoreMessage =
          'ПОМИЛКА АВТОВІДНОВЛЕННЯ: ' +
          String(
            restoreError && restoreError.message
              ? restoreError.message
              : restoreError
          );
      }
    }

    Logger.log(
      'FAILURE_V3: ' +
      JSON.stringify({
        ok: false,
        status: 'FAILED',
        error: String(
          error && error.message
            ? error.message
            : error
        ),
        recovery: restoreMessage,
        backupSheet: backupSheet
          ? backupSheet.getName()
          : null
      })
    );

    throw new Error(
      String(
        error && error.message
          ? error.message
          : error
      ) +
      ' ' +
      restoreMessage
    );

  } finally {
    lock.releaseLock();
  }
}


function restoreLastApprovedOrphanRollbackV3() {
  const config =
    ORPHAN_ROLLBACK_EXEC_V3_CONFIG;

  if (!config.manualRestoreEnabled) {
    const disabled = {
      ok: false,
      writesNow: false,
      status: 'MANUAL_RESTORE_DISABLED'
    };

    Logger.log(
      'RESTORE_RESULT_V3: ' +
      JSON.stringify(disabled)
    );

    return disabled;
  }

  const lock =
    LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Не вдалося отримати блокування документа за 30 секунд.'
    );
  }

  try {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const properties =
      PropertiesService.getDocumentProperties();

    const state =
      readOrphanRollbackV3Property_(
        properties
      );

    if (
      !state ||
      state.status !== 'SUCCESS' ||
      !state.backupSheet
    ) {
      throw new Error(
        'Не знайдено успішного виконання, доступного для відновлення.'
      );
    }

    const backupSheet =
      spreadsheet.getSheetByName(
        state.backupSheet
      );

    if (!backupSheet) {
      throw new Error(
        'Не знайдено резервний лист «' +
        state.backupSheet +
        '».'
      );
    }

    restoreOrphanRollbackV3Snapshot_(
      spreadsheet,
      backupSheet
    );

    SpreadsheetApp.flush();

    const restoredAt =
      new Date().toISOString();

    markOrphanRollbackV3Backup_(
      backupSheet,
      'MANUALLY_RESTORED',
      restoredAt
    );

    writeOrphanRollbackV3Property_(
      properties,
      {
        status: 'MANUALLY_RESTORED',
        branch: state.branch,
        backupSheet: state.backupSheet,
        restoredAt: restoredAt
      }
    );

    const result = {
      ok: true,
      writesNow: true,
      status: 'MANUALLY_RESTORED',
      branch: state.branch,
      backupSheet: state.backupSheet
    };

    Logger.log(
      'RESTORE_RESULT_V3: ' +
      JSON.stringify(result)
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


function validateOrphanRollbackV3Plan_(
  plan,
  expected
) {
  const errors = [];

  if (
    !plan ||
    plan.test !==
      'previewApprovedOrphanRollbackPlanV2'
  ) {
    return [
      'Не отримано коректний результат dry-run V2.'
    ];
  }

  if (plan.writesNow !== false) {
    errors.push(
      'Dry-run V2 несподівано повідомив про запис.'
    );
  }

  if (plan.branch !== expected.label) {
    errors.push(
      'Філія dry-run не збігається з очікуваною.'
    );
  }

  if (
    plan.operations.length !==
    expected.operations.length
  ) {
    errors.push(
      'Змінилася кількість погоджених операцій.'
    );
  }

  if (
    plan.stockChanges.length !==
    expected.stockChanges.length
  ) {
    errors.push(
      'Змінилася кількість складських змін.'
    );
  }

  expected.operations.forEach(
    function(expectedOperation) {
      const actual =
        plan.operations.find(function(item) {
          return (
            item.operationId ===
            expectedOperation.operationId
          );
        });

      if (!actual) {
        errors.push(
          'Не знайдено операцію «' +
          expectedOperation.operationId +
          '».'
        );

        return;
      }

      if (
        actual.status !==
        'READY_FOR_CONTROLLED_ROLLBACK'
      ) {
        errors.push(
          'Операція «' +
          expectedOperation.operationId +
          '» більше не готова.'
        );
      }

      if (
        actual.action !==
        expectedOperation.action
      ) {
        errors.push(
          'Змінилася дія для «' +
          expectedOperation.operationId +
          '».'
        );
      }

      compareOrphanRollbackV3Array_(
        errors,
        expectedOperation.operationId,
        'accrualRows',
        actual.accrualRows,
        expectedOperation.accrualRows
      );

      compareOrphanRollbackV3Array_(
        errors,
        expectedOperation.operationId,
        'registryRows',
        actual.registryRows,
        expectedOperation.registryRows
      );

      compareOrphanRollbackV3Array_(
        errors,
        expectedOperation.operationId,
        'movementRows',
        actual.movementRows,
        expectedOperation.movementRows
      );

      compareOrphanRollbackV3Array_(
        errors,
        expectedOperation.operationId,
        'stockReceiptRows',
        actual.stockReceiptRows,
        expectedOperation.stockReceiptRows
      );

      compareOrphanRollbackV3Array_(
        errors,
        expectedOperation.operationId,
        'assetRows',
        actual.assetRows,
        expectedOperation.assetRows
      );

      if (
        actual.errors &&
        actual.errors.length
      ) {
        errors.push(
          'Dry-run має помилки для «' +
          expectedOperation.operationId +
          '».'
        );
      }
    }
  );

  expected.stockChanges.forEach(
    function(expectedChange) {
      const actual =
        plan.stockChanges.find(
          function(item) {
            return (
              item.lotId ===
              expectedChange.lotId
            );
          }
        );

      if (!actual) {
        errors.push(
          'Не знайдено зміну партії «' +
          expectedChange.lotId +
          '».'
        );

        return;
      }

      if (
        actual.stockRow !==
        expectedChange.stockRow
      ) {
        errors.push(
          'Змінився рядок партії «' +
          expectedChange.lotId +
          '».'
        );
      }

      if (
        Boolean(actual.deleteReceiptRow) !==
        expectedChange.deleteReceiptRow
      ) {
        errors.push(
          'Змінився режим очищення партії «' +
          expectedChange.lotId +
          '».'
        );
      }

      compareOrphanRollbackV3StockState_(
        errors,
        expectedChange.lotId,
        'before',
        actual.before,
        expectedChange.before
      );

      compareOrphanRollbackV3StockState_(
        errors,
        expectedChange.lotId,
        'after',
        actual.after,
        expectedChange.after
      );

      if (
        !sameOrphanRollbackV3Number_(
          actual.transferredToBranches,
          expectedChange.transferredToBranches
        )
      ) {
        errors.push(
          'Змінився лічильник передач партії «' +
          expectedChange.lotId +
          '».'
        );
      }

      if (!actual.balanceReconciled) {
        errors.push(
          'Не сходиться складська партія «' +
          expectedChange.lotId +
          '».'
        );
      }

      if (
        actual.deleteReceiptRow &&
        actual.receiptRowCanBeCleared !== true
      ) {
        errors.push(
          'Партію «' +
          expectedChange.lotId +
          '» більше не можна очистити.'
        );
      }
    }
  );

  if (
    plan.protectedOperations.length !==
    expected.protected.length
  ) {
    errors.push(
      'Змінилася кількість захищених операцій.'
    );
  }

  expected.protected.forEach(
    function(expectedProtected) {
      const actual =
        plan.protectedOperations.find(
          function(item) {
            return (
              item.operationId ===
              expectedProtected.operationId
            );
          }
        );

      if (!actual) {
        errors.push(
          'Не знайдено захищену операцію «' +
          expectedProtected.operationId +
          '».'
        );

        return;
      }

      if (actual.existsInBase) {
        errors.push(
          'Захищена операція «' +
          expectedProtected.operationId +
          '» вже з’явилася у Базі.'
        );
      }

      compareOrphanRollbackV3Array_(
        errors,
        expectedProtected.operationId,
        'protected.stockRows',
        actual.stockRows,
        expectedProtected.stockRows
      );

      compareOrphanRollbackV3Array_(
        errors,
        expectedProtected.operationId,
        'protected.movementRows',
     actual.movementRows.map(
  function(item) {
    return typeof item === 'number'
      ? item
      : item.row;
  }
 ),
        expectedProtected.movementRows
      );
    }
  );

  return errors;
}


function assertOrphanRollbackV3LiveRows_(
  plan,
  expected,
  sheets
) {
  plan.operations.forEach(function(operation) {
    assertOrphanRollbackV3Ids_(
      sheets.accrual,
      operation.accrualRows,
      1,
      operation.operationId,
      false
    );

    assertOrphanRollbackV3Ids_(
      sheets.registry,
      operation.registryRows,
      2,
      operation.operationId,
      false
    );

    assertOrphanRollbackV3Ids_(
      sheets.movement,
      operation.movementRows,
      2,
      operation.operationId,
      true
    );

    assertOrphanRollbackV3Ids_(
      sheets.stock,
      operation.stockReceiptRows,
      2,
      operation.operationId,
      false
    );

    if (sheets.assets) {
      assertOrphanRollbackV3Ids_(
        sheets.assets,
        operation.assetRows,
        10,
        operation.operationId,
        false
      );
    }
  });

  expected.stockChanges.forEach(
    function(change) {
      const lotId =
        normalizeOrphanRollbackV2_(
          sheets.stock
            .getRange(change.stockRow, 1)
            .getDisplayValue()
        );

      if (lotId !== change.lotId) {
        throw new Error(
          'У складському рядку ' +
          change.stockRow +
          ' очікувалася партія «' +
          change.lotId +
          '».'
        );
      }

      const range =
        sheets.stock.getRange(
          change.stockRow,
          12,
          1,
          6
        );

      const live =
        range.getValues()[0];

      const formulas =
        range.getFormulas()[0];

      if (
        formulas.some(function(formula) {
          return Boolean(formula);
        })
      ) {
        throw new Error(
          'Партія «' +
          change.lotId +
          '» містить формулу в L:Q; ' +
          'автоматичний запис заблоковано.'
        );
      }

      assertOrphanRollbackV3StockArray_(
        change.lotId,
        live,
        change.before
      );
    }
  );
}


function applyOrphanRollbackV3_(
  plan,
  sheets
) {
  plan.operations.forEach(function(operation) {
    clearOrphanRollbackV3Rows_(
      sheets.accrual,
      operation.accrualRows
    );

    clearOrphanRollbackV3Rows_(
      sheets.registry,
      operation.registryRows
    );

    clearOrphanRollbackV3Rows_(
      sheets.movement,
      operation.movementRows
    );

    if (sheets.assets) {
      clearOrphanRollbackV3Rows_(
        sheets.assets,
        operation.assetRows
      );
    }
  });

  plan.stockChanges
    .filter(function(change) {
      return !change.deleteReceiptRow;
    })
    .forEach(function(change) {
      sheets.stock
        .getRange(
          change.stockRow,
          12,
          1,
          6
        )
        .setValues([[
          change.after.soldOrUsed,
          change.after.stored,
          change.after.writtenOff,
          change.after.currentBalance,
          change.after.minimumStock,
          change.after.status
        ]]);
    });

  const stockRowsToClear = [];

  plan.operations.forEach(function(operation) {
    operation.stockReceiptRows.forEach(
      function(row) {
        if (
          stockRowsToClear.indexOf(row) === -1
        ) {
          stockRowsToClear.push(row);
        }
      }
    );
  });

  clearOrphanRollbackV3Rows_(
    sheets.stock,
    stockRowsToClear
  );
}


function verifyOrphanRollbackV3Result_(
  plan,
  expected,
  sheets,
  protectedBefore
) {
  const errors = [];

  const approvedIds =
    new Set(
      expected.operations.map(function(item) {
        return item.operationId;
      })
    );

  findOrphanRollbackV3RemainingIds_(
    sheets,
    approvedIds
  ).forEach(function(item) {
    errors.push(
      'Залишився запис ' +
      item.sheet +
      '!' +
      item.row +
      ' для «' +
      item.operationId +
      '».'
    );
  });

  plan.stockChanges.forEach(function(change) {
   if (change.deleteReceiptRow) {
  /*
   * Перевіряємо ключові поля A:B.
   * Інші колонки можуть відображати результати ARRAYFORMULA
   * навіть після очищення самого запису партії.
   */
  const hasKeyContent =
    sheets.stock
      .getRange(
        change.stockRow,
        1,
        1,
        2
      )
      .getDisplayValues()[0]
      .some(function(value) {
        return (
          normalizeOrphanRollbackV2_(value) !== ''
        );
      });

  if (hasKeyContent) {
    errors.push(
      'Складський рядок ' +
      change.stockRow +
      ' для «' +
      change.lotId +
      '» зберіг ключові поля A:B.'
    );
  }

  return;
}

    const lotId =
      normalizeOrphanRollbackV2_(
        sheets.stock
          .getRange(change.stockRow, 1)
          .getDisplayValue()
      );

    if (lotId !== change.lotId) {
      errors.push(
        'Після запису змінилася партія ' +
        'у рядку ' +
        change.stockRow +
        '.'
      );

      return;
    }

    const live =
      sheets.stock
        .getRange(
          change.stockRow,
          12,
          1,
          6
        )
        .getValues()[0];

    try {
      assertOrphanRollbackV3StockArray_(
        change.lotId,
        live,
        change.after
      );

    } catch (error) {
      errors.push(
        String(error.message || error)
      );
    }
  });

  const protectedAfter =
    captureOrphanRollbackV3Protected_(
      expected,
      sheets
    );

  if (
    JSON.stringify(protectedBefore) !==
    JSON.stringify(protectedAfter)
  ) {
    errors.push(
      'Змінено один або більше захищених рядків.'
    );
  }

  return errors;
}


function collectOrphanRollbackV3SnapshotTargets_(
  plan,
  sheets
) {
  const targets = [];
  const seen = {};

  function add(sheet, rows) {
    if (!sheet) return;

    rows.forEach(function(row) {
      const key =
        sheet.getName() +
        '!' +
        row;

      if (seen[key]) return;

      seen[key] = true;

      targets.push({
        sheetName: sheet.getName(),
        row: row,
        columnCount: sheet.getLastColumn()
      });
    });
  }

  plan.operations.forEach(function(operation) {
    add(
      sheets.accrual,
      operation.accrualRows
    );

    add(
      sheets.registry,
      operation.registryRows
    );

    add(
      sheets.movement,
      operation.movementRows
    );

    add(
      sheets.stock,
      operation.stockReceiptRows
    );

    add(
      sheets.assets,
      operation.assetRows
    );
  });

  add(
    sheets.stock,
    plan.stockChanges.map(function(change) {
      return change.stockRow;
    })
  );

  targets.sort(function(left, right) {
    return (
      left.sheetName.localeCompare(
        right.sheetName
      ) ||
      left.row - right.row
    );
  });

  return targets;
}


function createOrphanRollbackV3Snapshot_(
  spreadsheet,
  branchLabel,
  targets
) {
  const timezone =
    spreadsheet.getSpreadsheetTimeZone();

  const timestamp =
    Utilities.formatDate(
      new Date(),
      timezone,
      'yyyyMMdd-HHmmss'
    );

  const suffix =
    Utilities.getUuid()
      .slice(0, 6)
      .toUpperCase();

  const name =
    ORPHAN_ROLLBACK_EXEC_V3_CONFIG.backupPrefix +
    timestamp +
    '_' +
    suffix;

  const backup =
    spreadsheet.insertSheet(name);

  const maxColumns =
    targets.reduce(
      function(maximum, item) {
        return Math.max(
          maximum,
          item.columnCount + 3
        );
      },
      7
    );

  if (
    backup.getMaxColumns() <
    maxColumns
  ) {
    backup.insertColumnsAfter(
      backup.getMaxColumns(),
      maxColumns -
        backup.getMaxColumns()
    );
  }

  backup
    .getRange(1, 1, 1, 7)
    .setValues([[
      'SNAPSHOT_READY',
      branchLabel,
      new Date(),
      targets.length,
      spreadsheet.getId(),
      'Не видаляти до завершення перевірки',
      ''
    ]]);

  backup
    .getRange(2, 1, 1, 4)
    .setValues([[
      'Лист',
      'Рядок',
      'Кількість колонок',
      'Знімок рядка →'
    ]]);

  targets.forEach(function(target, index) {
    const backupRow =
      index + 3;

    const sourceSheet =
      spreadsheet.getSheetByName(
        target.sheetName
      );

    backup
      .getRange(
        backupRow,
        1,
        1,
        3
      )
      .setValues([[
        target.sheetName,
        target.row,
        target.columnCount
      ]]);

    sourceSheet
      .getRange(
        target.row,
        1,
        1,
        target.columnCount
      )
      .copyTo(
        backup.getRange(
          backupRow,
          4,
          1,
          target.columnCount
        ),
        SpreadsheetApp.CopyPasteType.PASTE_NORMAL,
        false
      );
  });

  backup.setFrozenRows(2);
  backup.hideSheet();

  SpreadsheetApp.flush();

  return backup;
}


function restoreOrphanRollbackV3Snapshot_(
  spreadsheet,
  backupSheet
) {
  const lastRow =
    backupSheet.getLastRow();

  for (
    let row = 3;
    row <= lastRow;
    row++
  ) {
    const metadata =
      backupSheet
        .getRange(row, 1, 1, 3)
        .getValues()[0];

    const sheetName =
      normalizeOrphanRollbackV2_(
        metadata[0]
      );

    const sourceRow =
      Number(metadata[1]);

    const columnCount =
      Number(metadata[2]);

    if (
      !sheetName ||
      sourceRow < 1 ||
      columnCount < 1
    ) {
      continue;
    }

    const targetSheet =
      spreadsheet.getSheetByName(
        sheetName
      );

    if (!targetSheet) {
      throw new Error(
        'Під час відновлення не знайдено лист «' +
        sheetName +
        '».'
      );
    }

    backupSheet
      .getRange(
        row,
        4,
        1,
        columnCount
      )
      .copyTo(
        targetSheet.getRange(
          sourceRow,
          1,
          1,
          columnCount
        ),
        SpreadsheetApp.CopyPasteType.PASTE_NORMAL,
        false
      );
  }
}


function markOrphanRollbackV3Backup_(
  backupSheet,
  status,
  dateText
) {
  backupSheet
    .getRange(1, 1)
    .setValue(status);

  backupSheet
    .getRange(1, 7)
    .setValue(dateText);
}


function captureOrphanRollbackV3Protected_(
  expected,
  sheets
) {
  const result = [];

  expected.protected.forEach(function(item) {
    item.stockRows.forEach(function(row) {
      result.push(
        captureOrphanRollbackV3Row_(
          sheets.stock,
          row
        )
      );
    });

    item.movementRows.forEach(function(row) {
      result.push(
        captureOrphanRollbackV3Row_(
          sheets.movement,
          row
        )
      );
    });
  });

  return result;
}


function captureOrphanRollbackV3Row_(
  sheet,
  row
) {
  return {
    sheet: sheet.getName(),
    row: row,

    values: sheet
      .getRange(
        row,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0],

    formulas: sheet
      .getRange(
        row,
        1,
        1,
        sheet.getLastColumn()
      )
      .getFormulas()[0]
  };
}


function findOrphanRollbackV3RemainingIds_(
  sheets,
  approvedIds
) {
  const found = [];

  scan(
    sheets.accrual,
    1,
    2,
    false
  );

  scan(
    sheets.registry,
    2,
    2,
    false
  );

  scan(
    sheets.movement,
    2,
    2,
    true
  );

  scan(
    sheets.stock,
    2,
    3,
    false
  );

  if (sheets.assets) {
    scan(
      sheets.assets,
      10,
      3,
      false
    );
  }

  return found;

  function scan(
    sheet,
    column,
    firstRow,
    useRoot
  ) {
    const lastRow =
      sheet.getLastRow();

    if (lastRow < firstRow) return;

    const values =
      sheet
        .getRange(
          firstRow,
          column,
          lastRow - firstRow + 1,
          1
        )
        .getDisplayValues();

    values.forEach(function(item, index) {
      const technicalId =
        normalizeOrphanRollbackV2_(
          item[0]
        );

      const operationId =
        useRoot
          ? getOrphanRollbackV2RootId_(
              technicalId
            )
          : technicalId;

      if (
        approvedIds.has(operationId)
      ) {
        found.push({
          sheet: sheet.getName(),
          row: firstRow + index,
          operationId: operationId
        });
      }
    });
  }
}


function clearOrphanRollbackV3Rows_(
  sheet,
  rows
) {
  rows.forEach(function(row) {
    sheet
      .getRange(
        row,
        1,
        1,
        sheet.getLastColumn()
      )
      .clearContent();
  });
}


function assertOrphanRollbackV3Ids_(
  sheet,
  rows,
  column,
  operationId,
  useRoot
) {
  rows.forEach(function(row) {
    const technicalId =
      normalizeOrphanRollbackV2_(
        sheet
          .getRange(row, column)
          .getDisplayValue()
      );

    const actualId =
      useRoot
        ? getOrphanRollbackV2RootId_(
            technicalId
          )
        : technicalId;

    if (actualId !== operationId) {
      throw new Error(
        'Перевірка рядка ' +
        sheet.getName() +
        '!' +
        row +
        ' не пройдена: очікувався ID «' +
        operationId +
        '».'
      );
    }
  });
}


function assertOrphanRollbackV3StockArray_(
  lotId,
  live,
  expectedState
) {
  const expected = [
    expectedState.soldOrUsed,
    expectedState.stored,
    expectedState.writtenOff,
    expectedState.currentBalance,
    expectedState.minimumStock,
    expectedState.status
  ];

  for (
    let index = 0;
    index < 5;
    index++
  ) {
    if (
      !sameOrphanRollbackV3Number_(
        live[index],
        expected[index]
      )
    ) {
      throw new Error(
        'Партія «' +
        lotId +
        '»: значення колонки ' +
        (12 + index) +
        ' змінилося.'
      );
    }
  }

  if (
    normalizeOrphanRollbackV2_(
      live[5]
    ) !== expected[5]
  ) {
    throw new Error(
      'Партія «' +
      lotId +
      '»: змінився статус.'
    );
  }
}


function compareOrphanRollbackV3StockState_(
  errors,
  lotId,
  label,
  actual,
  expected
) {
  [
    'soldOrUsed',
    'stored',
    'writtenOff',
    'currentBalance',
    'minimumStock'
  ].forEach(function(key) {
    if (
      !sameOrphanRollbackV3Number_(
        actual[key],
        expected[key]
      )
    ) {
      errors.push(
        'Партія «' +
        lotId +
        '»: змінилося ' +
        label +
        '.' +
        key +
        '.'
      );
    }
  });

  if (
    normalizeOrphanRollbackV2_(
      actual.status
    ) !== expected.status
  ) {
    errors.push(
      'Партія «' +
      lotId +
      '»: змінився ' +
      label +
      '.status.'
    );
  }
}


function compareOrphanRollbackV3Array_(
  errors,
  operationId,
  label,
  actual,
  expected
) {
  if (
    JSON.stringify(actual) !==
    JSON.stringify(expected)
  ) {
    errors.push(
      'Операція «' +
      operationId +
      '»: змінився список ' +
      label +
      '.'
    );
  }
}


function getOrphanRollbackV3Sheets_(
  spreadsheet
) {
  const names =
    ORPHAN_ROLLBACK_V2_CONFIG.sheets;

  const result = {};

  Object.keys(names).forEach(function(key) {
    result[key] =
      spreadsheet.getSheetByName(
        names[key]
      );
  });

  [
    'base',
    'stock',
    'movement',
    'registry',
    'accrual',
    'transfers'
  ].forEach(function(key) {
    if (!result[key]) {
      throw new Error(
        'Не знайдено лист «' +
        names[key] +
        '».'
      );
    }
  });

  return result;
}


function resolveOrphanRollbackV3Branch_(
  spreadsheetName
) {
  const name =
    normalizeOrphanRollbackV2_(
      spreadsheetName
    ).toLowerCase();

  if (
    name.indexOf('бабурка') !== -1
  ) {
    return (
      ORPHAN_ROLLBACK_EXEC_V3_CONFIG
        .branches
        .baburka
    );
  }

  if (
    name.indexOf('альтернатива') !== -1
  ) {
    return (
      ORPHAN_ROLLBACK_EXEC_V3_CONFIG
        .branches
        .alternative
    );
  }

  throw new Error(
    'Виконання заборонено для таблиці «' +
    spreadsheetName +
    '».'
  );
}


function assertOrphanRollbackV3Dependency_() {
  if (
    typeof previewApprovedOrphanRollbackPlanV2 !==
      'function' ||
    typeof normalizeOrphanRollbackV2_ !==
      'function' ||
    typeof getOrphanRollbackV2RootId_ !==
      'function' ||
    typeof ORPHAN_ROLLBACK_V2_CONFIG ===
      'undefined'
  ) {
    throw new Error(
      'Не знайдено orphanRollbackPlanV2.gs ' +
      'або потрібні функції dry-run V2.'
    );
  }
}


function readOrphanRollbackV3Property_(
  properties
) {
  const raw =
    properties.getProperty(
      ORPHAN_ROLLBACK_EXEC_V3_CONFIG
        .propertyKey
    );

  if (!raw) return null;

  try {
    return JSON.parse(raw);

  } catch (error) {
    throw new Error(
      'Пошкоджено службовий стан ' +
      'попереднього запуску V3.'
    );
  }
}


function writeOrphanRollbackV3Property_(
  properties,
  value
) {
  properties.setProperty(
    ORPHAN_ROLLBACK_EXEC_V3_CONFIG
      .propertyKey,
    JSON.stringify(value)
  );
}


function sameOrphanRollbackV3Number_(
  left,
  right
) {
  return (
    Math.abs(
      numberOrphanRollbackV2_(left) -
      numberOrphanRollbackV2_(right)
    ) <=
    ORPHAN_ROLLBACK_EXEC_V3_CONFIG
      .tolerance
  );
}


function opV3_(
  operationId,
  action,
  accrualRows,
  registryRows,
  movementRows,
  stockReceiptRows,
  assetRows
) {
  return Object.freeze({
    operationId: operationId,
    action: action,
    accrualRows: Object.freeze(
      accrualRows
    ),
    registryRows: Object.freeze(
      registryRows
    ),
    movementRows: Object.freeze(
      movementRows
    ),
    stockReceiptRows: Object.freeze(
      stockReceiptRows
    ),
    assetRows: Object.freeze(
      assetRows
    )
  });
}


function stockV3_(
  lotId,
  stockRow,
  deleteReceiptRow,
  beforeValues,
  afterValues,
  transferredToBranches
) {
  return Object.freeze({
    lotId: lotId,
    stockRow: stockRow,
    deleteReceiptRow: deleteReceiptRow,
    before: stockStateV3_(
      beforeValues
    ),
    after: stockStateV3_(
      afterValues
    ),
    transferredToBranches:
      transferredToBranches
  });
}


function stockStateV3_(values) {
  return Object.freeze({
    soldOrUsed: values[0],
    stored: values[1],
    writtenOff: values[2],
    currentBalance: values[3],
    minimumStock: values[4],
    status: values[5]
  });
}


function protectedV3_(
  operationId,
  stockRows,
  movementRows
) {
  return Object.freeze({
    operationId: operationId,
    stockRows: Object.freeze(
      stockRows
    ),
    movementRows: Object.freeze(
      movementRows
    )
  });
}