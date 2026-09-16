/**
 * PROFIN OS — LEGACY NONZERO, КРОК 4
 * Одноопераційний захист першого реального проведення.
 *
 * Порядок:
 * 1. armLegacyNonzeroRollbackProtectionStep4()
 * 2. Натиснути «Провести операцію»
 * 3. inspectLegacyNonzeroRollbackProtectionStep4()
 * 4. confirmProtectedLegacyNonzeroChangeStep4()
 *    або rollbackProtectedLegacyNonzeroChangeStep4()
 */
function armLegacyNonzeroRollbackProtectionStep4() {
  const C =
    legacyNonzeroGuardConfig_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(
    C.lockTimeoutMs
  );

  try {
    const props =
      PropertiesService
        .getDocumentProperties();

    if (
      props.getProperty(
        C.guardProperty
      )
    ) {
      throw new Error(
        'Захист уже озброєно. Запустіть ' +
        'inspectLegacyNonzeroRollbackProtectionStep4().'
      );
    }

    if (
      typeof legacyNonzeroProductionBuildPlan_ !==
        'function' ||
      typeof rollbackBaseOperationById_ !==
        'function'
    ) {
      throw new Error(
        'Не знайдено виробничий план кроку 3 ' +
        'або rollbackBaseOperationById_().'
      );
    }

    const input =
      ss.getSheetByName(
        C.inputSheet
      );

    const registry =
      ss.getSheetByName(
        C.registrySheet
      );

    const base =
      ss.getSheetByName(
        C.baseSheet
      );

    const accruals =
      ss.getSheetByName(
        C.accrualSheet
      );

    if (
      !input ||
      !registry ||
      !base ||
      !accruals
    ) {
      throw new Error(
        'Не знайдено форму, реєстр, ' +
        'Базу операцій або Нарахування.'
      );
    }

    const plan =
      legacyNonzeroProductionBuildPlan_();

    if (
      !plan ||
      plan.ok !== true ||
      plan.canWrite !== true
    ) {
      throw new Error(
        plan && plan.reason
          ? plan.reason
          : 'LEGACY NONZERO план не дозволено.'
      );
    }

    const actualDate =
      input
        .getRange('G13')
        .getValue();

    const operationDate =
      input
        .getRange('B4')
        .getValue();

    const comment =
      legacyNonzeroGuardClean_(
        input
          .getRange('B14')
          .getDisplayValue()
      );

    if (
      !(actualDate instanceof Date) ||
      isNaN(actualDate.getTime())
    ) {
      throw new Error(
        'У G13 потрібна коректна фактична дата.'
      );
    }

    if (
      !(operationDate instanceof Date) ||
      isNaN(operationDate.getTime())
    ) {
      throw new Error(
        'У B4 потрібна коректна дата операції.'
      );
    }

    const accrualLastRowBefore =
      legacyNonzeroGuardLastAccrualDataRow_(
        accruals
      );

    const expectedAccrualRow =
      Math.max(
        accrualLastRowBefore + 1,
        2
      );

    const expectedAccrualRange =
      accruals.getRange(
        expectedAccrualRow,
        1,
        1,
        8
      );

    const snapshot = {
      version:
        C.version,

      armedAt:
        new Date().toISOString(),

      spreadsheetId:
        ss.getId(),

      vaccineId:
        plan.vaccineId,

      saleId:
        plan.saleId,

      vaccineName:
        plan.vaccineName,

      storedCost:
        plan.storedCost,

      registryRow:
        plan.registryRow,

      requestedStatus:
        plan.newStatus,

      actualDateIso:
        actualDate.toISOString(),

      operationDateKey:
        legacyNonzeroGuardDateKey_(
          operationDate
        ),

      expectedComment:
        comment,

      expectedAccrualCategory:
        plan.newStatus ===
          'Використано'
          ? 'Продаж і використання'
          : 'Списання вакцин',

      expectedAccrualMarker:
        C.markerPrefix +
        ' | ' +
        plan.newStatus +
        ' | ' +
        plan.vaccineId,

      baseLastDataRowBefore:
        legacyNonzeroGuardLastBaseDataRow_(
          base
        ),

      accrualLastDataRowBefore:
        accrualLastRowBefore,

      expectedAccrualRow:
        expectedAccrualRow,

      expectedAccrualFormats:
        expectedAccrualRange
          .getNumberFormats()[0],

      registryCells: {
        status:
          legacyNonzeroGuardCellSnapshot_(
            registry.getRange(
              plan.registryRow,
              6
            )
          ),

        actualDate:
          legacyNonzeroGuardCellSnapshot_(
            registry.getRange(
              plan.registryRow,
              8
            )
          ),

        comment:
          legacyNonzeroGuardCellSnapshot_(
            registry.getRange(
              plan.registryRow,
              9
            )
          )
      }
    };

    props.setProperty(
      C.guardProperty,
      JSON.stringify(snapshot)
    );

    const result = {
      ok:
        true,

      test:
        'armLegacyNonzeroRollbackProtectionStep4',

      version:
        C.version,

      armed:
        true,

      state:
        'ARMED_BEFORE_OPERATION',

      vaccineId:
        snapshot.vaccineId,

      vaccineName:
        snapshot.vaccineName,

      storedCost:
        snapshot.storedCost,

      registryRow:
        snapshot.registryRow,

      requestedStatus:
        snapshot.requestedStatus,

      expectedAccrualAmount:
        -Math.abs(
          snapshot.storedCost
        ),

      rollbackScope:
        'F/H/I реєстру + одне точне нарахування ' +
        '+ одна точна операція Бази',

      stockWillBeTouched:
        false,

      movementWillBeTouched:
        false,

      buttonMayBePressed:
        true,

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

    return result;

  } finally {
    lock.releaseLock();
  }
}


function inspectLegacyNonzeroRollbackProtectionStep4() {
  const C =
    legacyNonzeroGuardConfig_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const raw =
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        C.guardProperty
      );

  if (!raw) {
    const empty = {
      ok:
        true,

      test:
        'inspectLegacyNonzeroRollbackProtectionStep4',

      armed:
        false,

      state:
        'NO_GUARD',

      rollbackAvailable:
        false,

      writesNow:
        false
    };

    Logger.log(
      JSON.stringify(
        empty,
        null,
        2
      )
    );

    return empty;
  }

  const snapshot =
    JSON.parse(raw);

  const registry =
    ss.getSheetByName(
      C.registrySheet
    );

  const base =
    ss.getSheetByName(
      C.baseSheet
    );

  const accruals =
    ss.getSheetByName(
      C.accrualSheet
    );

  if (
    !registry ||
    !base ||
    !accruals
  ) {
    throw new Error(
      'Не знайдено реєстр, ' +
      'Базу операцій або Нарахування.'
    );
  }

  const baseCandidates =
    legacyNonzeroGuardFindBaseCandidates_(
      base,
      snapshot
    );

  const accrualCandidates =
    legacyNonzeroGuardFindAccrualCandidates_(
      accruals,
      snapshot
    );

  const beforeMatches =
    legacyNonzeroGuardRegistryBeforeMatches_(
      registry,
      snapshot
    );

  const committedMatches =
    legacyNonzeroGuardRegistryCommittedMatches_(
      registry,
      snapshot
    );

  let state =
    'UNEXPECTED_STATE';

  if (
    beforeMatches &&
    baseCandidates.length === 0 &&
    accrualCandidates.length === 0
  ) {
    state =
      'ARMED_BEFORE_OPERATION';

  } else if (
    committedMatches &&
    baseCandidates.length === 1 &&
    accrualCandidates.length === 1
  ) {
    state =
      'COMMITTED_ROLLBACK_AVAILABLE';
  }

  const result = {
    ok:
      state !==
      'UNEXPECTED_STATE',

    test:
      'inspectLegacyNonzeroRollbackProtectionStep4',

    version:
      snapshot.version,

    armed:
      true,

    state:
      state,

    vaccineId:
      snapshot.vaccineId,

    protectedBaseOperationRows:
      baseCandidates.map(
        function(item) {
          return item.row;
        }
      ),

    protectedBaseOperationIds:
      baseCandidates.map(
        function(item) {
          return item.operationId;
        }
      ),

    protectedAccrualRows:
      accrualCandidates.map(
        function(item) {
          return item.row;
        }
      ),

    protectedAccrualAmounts:
      accrualCandidates.map(
        function(item) {
          return item.amount;
        }
      ),

    rollbackAvailable:
      state ===
      'COMMITTED_ROLLBACK_AVAILABLE',

    businessValuesChangedByInspection:
      false,

    writesNow:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


function rollbackProtectedLegacyNonzeroChangeStep4() {
  const C =
    legacyNonzeroGuardConfig_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(
    C.lockTimeoutMs
  );

  try {
    const props =
      PropertiesService
        .getDocumentProperties();

    const raw =
      props.getProperty(
        C.guardProperty
      );

    if (!raw) {
      throw new Error(
        'Немає озброєного захисту для відкату.'
      );
    }

    const snapshot =
      JSON.parse(raw);

    if (
      snapshot.spreadsheetId &&
      snapshot.spreadsheetId !==
        ss.getId()
    ) {
      throw new Error(
        'Захисний знімок належить іншій таблиці.'
      );
    }

    const registry =
      ss.getSheetByName(
        C.registrySheet
      );

    const base =
      ss.getSheetByName(
        C.baseSheet
      );

    const accruals =
      ss.getSheetByName(
        C.accrualSheet
      );

    if (
      !registry ||
      !base ||
      !accruals
    ) {
      throw new Error(
        'Не знайдено реєстр, Базу операцій ' +
        'або Нарахування.'
      );
    }

    if (
      legacyNonzeroGuardClean_(
        registry
          .getRange(
            snapshot.registryRow,
            1
          )
          .getValue()
      ) !== snapshot.vaccineId
    ) {
      throw new Error(
        'Рядок реєстру не відповідає ' +
        'захищеній вакцині.'
      );
    }

    const baseCandidates =
      legacyNonzeroGuardFindBaseCandidates_(
        base,
        snapshot
      );

    const accrualCandidates =
      legacyNonzeroGuardFindAccrualCandidates_(
        accruals,
        snapshot
      );

    if (
      baseCandidates.length !== 1 ||
      accrualCandidates.length !== 1
    ) {
      throw new Error(
        'Не знайдено рівно одну операцію Бази ' +
        'та одне нарахування. ' +
        'Відкат зупинено без змін.'
      );
    }

    if (
      !legacyNonzeroGuardRegistryCommittedMatches_(
        registry,
        snapshot
      )
    ) {
      throw new Error(
        'Реєстр змінено після проведення. ' +
        'Автоматичний відкат заблоковано.'
      );
    }

    const baseCandidate =
      baseCandidates[0];

    const accrualCandidate =
      accrualCandidates[0];

    const duplicateBaseIds =
      legacyNonzeroGuardCountBaseId_(
        base,
        baseCandidate.operationId
      );

    if (
      duplicateBaseIds !== 1
    ) {
      throw new Error(
        'ID захищеної операції Бази не є унікальним.'
      );
    }

    /*
     * Зберігаємо стан після проведення.
     * Якщо відкат перерветься, цей стан
     * буде відновлений.
     */
    const committedRegistry = {
      status:
        legacyNonzeroGuardCellSnapshot_(
          registry.getRange(
            snapshot.registryRow,
            6
          )
        ),

      actualDate:
        legacyNonzeroGuardCellSnapshot_(
          registry.getRange(
            snapshot.registryRow,
            8
          )
        ),

      comment:
        legacyNonzeroGuardCellSnapshot_(
          registry.getRange(
            snapshot.registryRow,
            9
          )
        )
    };

    const baseRange =
      base.getRange(
        baseCandidate.row,
        1,
        1,
        33
      );

    const baseCommitted = {
      values:
        baseRange.getValues()[0],

      formats:
        baseRange
          .getNumberFormats()[0]
    };

    const accrualRange =
      accruals.getRange(
        accrualCandidate.row,
        1,
        1,
        8
      );

    const accrualCommitted = {
      values:
        accrualRange.getValues()[0],

      formats:
        accrualRange
          .getNumberFormats()[0]
    };

    try {
      /*
       * 1. База операцій.
       */
      rollbackBaseOperationById_(
        baseCandidate.operationId
      );

      /*
       * 2. Реєстр вакцин.
       */
      legacyNonzeroGuardRestoreCell_(
        registry.getRange(
          snapshot.registryRow,
          6
        ),
        snapshot.registryCells.status
      );

      legacyNonzeroGuardRestoreCell_(
        registry.getRange(
          snapshot.registryRow,
          8
        ),
        snapshot.registryCells.actualDate
      );

      legacyNonzeroGuardRestoreCell_(
        registry.getRange(
          snapshot.registryRow,
          9
        ),
        snapshot.registryCells.comment
      );

      /*
       * 3. Нарахування.
       */
      accrualRange.clearContent();

      if (
        accrualCandidate.row ===
        snapshot.expectedAccrualRow
      ) {
        accrualRange.setNumberFormats([
          snapshot.expectedAccrualFormats
        ]);
      }

      SpreadsheetApp.flush();

      /*
       * Контроль відкату.
       */
      if (
        legacyNonzeroGuardCountBaseId_(
          base,
          baseCandidate.operationId
        ) !== 0
      ) {
        throw new Error(
          'Захищена операція залишилась у Базі.'
        );
      }

      if (
        legacyNonzeroGuardClean_(
          accruals
            .getRange(
              accrualCandidate.row,
              8
            )
            .getValue()
        ) ===
        snapshot.expectedAccrualMarker
      ) {
        throw new Error(
          'Захищене нарахування залишилось після відкату.'
        );
      }

      if (
        !legacyNonzeroGuardRegistryBeforeMatches_(
          registry,
          snapshot
        )
      ) {
        throw new Error(
          'Початковий стан реєстру не відновлено.'
        );
      }

    } catch (rollbackError) {
      /*
       * Компенсація невдалого відкату:
       * повертаємо стан після проведення.
       */
      baseRange
        .setValues([
          baseCommitted.values
        ])
        .setNumberFormats([
          baseCommitted.formats
        ]);

      accrualRange
        .setValues([
          accrualCommitted.values
        ])
        .setNumberFormats([
          accrualCommitted.formats
        ]);

      legacyNonzeroGuardRestoreCell_(
        registry.getRange(
          snapshot.registryRow,
          6
        ),
        committedRegistry.status
      );

      legacyNonzeroGuardRestoreCell_(
        registry.getRange(
          snapshot.registryRow,
          8
        ),
        committedRegistry.actualDate
      );

      legacyNonzeroGuardRestoreCell_(
        registry.getRange(
          snapshot.registryRow,
          9
        ),
        committedRegistry.comment
      );

      SpreadsheetApp.flush();

      throw new Error(
        'Відкат не завершено. ' +
        'Стан після проведення відновлено. Причина: ' +
        legacyNonzeroGuardError_(
          rollbackError
        )
      );
    }

    props.deleteProperty(
      C.guardProperty
    );

    const result = {
      ok:
        true,

      test:
        'rollbackProtectedLegacyNonzeroChangeStep4',

      version:
        C.version,

      vaccineId:
        snapshot.vaccineId,

      baseOperationIdRemoved:
        baseCandidate.operationId,

      accrualRowCleared:
        accrualCandidate.row,

      accrualAmountReversed:
        accrualCandidate.amount,

      registryRestored:
        true,

      baseOperationRemoved:
        true,

      accrualRemoved:
        true,

      stockChanged:
        false,

      movementChanged:
        false,

      rollbackProtectionClosed:
        true
    };

    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


function confirmProtectedLegacyNonzeroChangeStep4() {
  const C =
    legacyNonzeroGuardConfig_();

  const inspection =
    inspectLegacyNonzeroRollbackProtectionStep4();

  if (
    inspection.state !==
    'COMMITTED_ROLLBACK_AVAILABLE'
  ) {
    throw new Error(
      'Немає підтвердженого проведення ' +
      'для остаточного прийняття.'
    );
  }

  PropertiesService
    .getDocumentProperties()
    .deleteProperty(
      C.guardProperty
    );

  const result = {
    ok:
      true,

    test:
      'confirmProtectedLegacyNonzeroChangeStep4',

    version:
      C.version,

    vaccineId:
      inspection.vaccineId,

    committedOperationAccepted:
      true,

    rollbackProtectionClosed:
      true,

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

  return result;
}


function cancelArmedLegacyNonzeroProtectionStep4() {
  const C =
    legacyNonzeroGuardConfig_();

  const inspection =
    inspectLegacyNonzeroRollbackProtectionStep4();

  if (
    inspection.state !==
    'ARMED_BEFORE_OPERATION'
  ) {
    throw new Error(
      'Захист можна скасувати лише до проведення.'
    );
  }

  PropertiesService
    .getDocumentProperties()
    .deleteProperty(
      C.guardProperty
    );

  const result = {
    ok:
      true,

    test:
      'cancelArmedLegacyNonzeroProtectionStep4',

    cancelled:
      true,

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

  return result;
}


function legacyNonzeroGuardFindBaseCandidates_(
  base,
  snapshot
) {
  const startRow =
    Number(
      snapshot.baseLastDataRowBefore
    ) + 1;

  const lastRow =
    legacyNonzeroGuardLastBaseDataRow_(
      base
    );

  if (
    lastRow < startRow
  ) {
    return [];
  }

  return base
    .getRange(
      startRow,
      1,
      lastRow - startRow + 1,
      33
    )
    .getValues()
    .map(function(row, index) {
      return {
        row:
          startRow + index,

        operationId:
          legacyNonzeroGuardClean_(
            row[0]
          ),

        operationDateKey:
          legacyNonzeroGuardDateKey_(
            row[3]
          ),

        type:
          legacyNonzeroGuardClean_(
            row[9]
          ),

        category:
          legacyNonzeroGuardClean_(
            row[10]
          ),

        article:
          legacyNonzeroGuardClean_(
            row[11]
          ),

        vaccineReference:
          legacyNonzeroGuardClean_(
            row[24]
          )
      };
    })
    .filter(function(item) {
      return (
        item.operationId &&
        item.operationDateKey ===
          snapshot.operationDateKey &&
        item.type ===
          'Вакцина' &&
        item.category ===
          'Зміна статусу' &&
        item.article ===
          snapshot.requestedStatus &&
        item.vaccineReference
          .indexOf(
            snapshot.vaccineId
          ) !== -1
      );
    });
}


function legacyNonzeroGuardFindAccrualCandidates_(
  accruals,
  snapshot
) {
  const startRow =
    Number(
      snapshot.accrualLastDataRowBefore
    ) + 1;

  const lastRow =
    legacyNonzeroGuardLastAccrualDataRow_(
      accruals
    );

  if (
    lastRow < startRow
  ) {
    return [];
  }

  return accruals
    .getRange(
      startRow,
      1,
      lastRow - startRow + 1,
      8
    )
    .getValues()
    .map(function(row, index) {
      return {
        row:
          startRow + index,

        saleId:
          legacyNonzeroGuardClean_(
            row[0]
          ),

        type:
          legacyNonzeroGuardClean_(
            row[1]
          ),

        actualDateIso:
          row[2] instanceof Date &&
          !isNaN(
            row[2].getTime()
          )
            ? row[2].toISOString()
            : '',

        category:
          legacyNonzeroGuardClean_(
            row[3]
          ),

        vaccineName:
          legacyNonzeroGuardClean_(
            row[4]
          ),

        amount:
          legacyNonzeroGuardNumber_(
            row[5]
          ),

        marker:
          legacyNonzeroGuardClean_(
            row[7]
          )
      };
    })
    .filter(function(item) {
      return (
        item.saleId ===
          snapshot.saleId &&

        item.type ===
          'Вакцина' &&

        item.actualDateIso ===
          snapshot.actualDateIso &&

        item.category ===
          snapshot.expectedAccrualCategory &&

        legacyNonzeroGuardNormalize_(
          item.vaccineName
        ) ===
        legacyNonzeroGuardNormalize_(
          snapshot.vaccineName
        ) &&

        Math.abs(
          item.amount +
          Math.abs(
            snapshot.storedCost
          )
        ) <= 0.000001 &&

        item.marker ===
          snapshot.expectedAccrualMarker
      );
    });
}


function legacyNonzeroGuardRegistryBeforeMatches_(
  registry,
  snapshot
) {
  return (
    legacyNonzeroGuardRangeMatches_(
      registry.getRange(
        snapshot.registryRow,
        6
      ),
      snapshot.registryCells.status
    ) &&

    legacyNonzeroGuardRangeMatches_(
      registry.getRange(
        snapshot.registryRow,
        8
      ),
      snapshot.registryCells.actualDate
    ) &&

    legacyNonzeroGuardRangeMatches_(
      registry.getRange(
        snapshot.registryRow,
        9
      ),
      snapshot.registryCells.comment
    )
  );
}


function legacyNonzeroGuardRegistryCommittedMatches_(
  registry,
  snapshot
) {
  const actualDate =
    registry
      .getRange(
        snapshot.registryRow,
        8
      )
      .getValue();

  return (
    legacyNonzeroGuardClean_(
      registry
        .getRange(
          snapshot.registryRow,
          6
        )
        .getValue()
    ) ===
      snapshot.requestedStatus &&

    actualDate instanceof Date &&

    !isNaN(
      actualDate.getTime()
    ) &&

    actualDate.toISOString() ===
      snapshot.actualDateIso &&

    legacyNonzeroGuardClean_(
      registry
        .getRange(
          snapshot.registryRow,
          9
        )
        .getValue()
    ) ===
      snapshot.expectedComment
  );
}


function legacyNonzeroGuardLastBaseDataRow_(
  base
) {
  const lastRow =
    base.getLastRow();

  if (
    lastRow < 2
  ) {
    return 1;
  }

  const ids =
    base
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues();

  for (
    let index = ids.length - 1;
    index >= 0;
    index--
  ) {
    if (
      legacyNonzeroGuardClean_(
        ids[index][0]
      )
    ) {
      return index + 2;
    }
  }

  return 1;
}


function legacyNonzeroGuardLastAccrualDataRow_(
  accruals
) {
  const lastRow =
    accruals.getLastRow();

  if (
    lastRow < 2
  ) {
    return 1;
  }

  const rows =
    accruals
      .getRange(
        2,
        1,
        lastRow - 1,
        8
      )
      .getDisplayValues();

  for (
    let index = rows.length - 1;
    index >= 0;
    index--
  ) {
    const occupied =
      rows[index].some(
        function(value) {
          return (
            legacyNonzeroGuardClean_(
              value
            ) !== ''
          );
        }
      );

    if (occupied) {
      return index + 2;
    }
  }

  return 1;
}


function legacyNonzeroGuardCountBaseId_(
  base,
  operationId
) {
  if (
    base.getLastRow() < 2
  ) {
    return 0;
  }

  return base
    .getRange(
      2,
      1,
      base.getLastRow() - 1,
      1
    )
    .getDisplayValues()
    .filter(function(row) {
      return (
        legacyNonzeroGuardClean_(
          row[0]
        ) === operationId
      );
    })
    .length;
}


function legacyNonzeroGuardCellSnapshot_(
  range
) {
  const value =
    range.getValue();

  return {
    formula:
      range.getFormula(),

    value:
      value instanceof Date
        ? {
            type:
              'DATE',

            value:
              value.toISOString()
          }
        : {
            type:
              'VALUE',

            value:
              value
          },

    numberFormat:
      range.getNumberFormat()
  };
}


function legacyNonzeroGuardRestoreCell_(
  range,
  snapshot
) {
  if (
    snapshot.formula
  ) {
    range.setFormula(
      snapshot.formula
    );

  } else if (
    snapshot.value &&
    snapshot.value.type ===
      'DATE'
  ) {
    range.setValue(
      new Date(
        snapshot.value.value
      )
    );

  } else {
    range.setValue(
      snapshot.value
        ? snapshot.value.value
        : ''
    );
  }

  range.setNumberFormat(
    snapshot.numberFormat
  );
}


function legacyNonzeroGuardRangeMatches_(
  range,
  snapshot
) {
  return (
    JSON.stringify(
      legacyNonzeroGuardCellSnapshot_(
        range
      )
    ) ===
    JSON.stringify(
      snapshot
    )
  );
}


function legacyNonzeroGuardDateKey_(
  value
) {
  if (
    !(value instanceof Date) ||
    isNaN(value.getTime())
  ) {
    return '';
  }

  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function legacyNonzeroGuardConfig_() {
  return {
    version:
      '4.0-committed-rollback-protection',

    guardProperty:
      'PROFIN_LEGACY_NONZERO_COMMITTED_ROLLBACK_GUARD',

    markerPrefix:
      'LEGACY NONZERO STATUS COST',

    lockTimeoutMs:
      30000,

    inputSheet:
      'Ввід операцій',

    registrySheet:
      'Облік вакцин',

    baseSheet:
      'База операцій',

    accrualSheet:
      'Нарахування'
  };
}


function legacyNonzeroGuardClean_(
  value
) {
  return String(
    value == null
      ? ''
      : value
  )
    .replace(
      /\u00A0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


function legacyNonzeroGuardNormalize_(
  value
) {
  return legacyNonzeroGuardClean_(
    value
  ).toLowerCase();
}


function legacyNonzeroGuardNumber_(
  value
) {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  const parsed =
    Number(
      legacyNonzeroGuardClean_(
        value
      )
        .replace(
          /\s/g,
          ''
        )
        .replace(
          ',',
          '.'
        )
        .replace(
          /[^\d.-]/g,
          ''
        )
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}


function legacyNonzeroGuardError_(
  error
) {
  return (
    error &&
    error.message
  )
    ? error.message
    : String(error);
}