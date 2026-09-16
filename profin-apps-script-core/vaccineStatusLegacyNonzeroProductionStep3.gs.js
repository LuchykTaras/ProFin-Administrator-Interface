/**
 * PROFIN OS — LEGACY NONZERO, КРОК 3
 *
 * Одноразовий виробничий маршрут для 16 історичних вакцин
 * із ненульовою собівартістю та порожніми J/M.
 *
 * Записує атомарно:
 * — F/H/I у «Облік вакцин»;
 * — один рядок «Нарахування» на суму -E.
 *
 * Не змінює:
 * — склад;
 * — рух складу;
 * — J/M;
 * — форму вводу.
 */
function executeLegacyNonzeroStoredVaccineStatus_(
  actualDate,
  comment
) {
  const C = legacyNonzeroProductionConfig_();

  if (
    !(actualDate instanceof Date) ||
    isNaN(actualDate.getTime())
  ) {
    throw new Error(
      'Потрібна коректна фактична дата.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const lock =
    LockService.getDocumentLock();

  const props =
    PropertiesService.getDocumentProperties();

  let snapshot = null;

  lock.waitLock(C.lockTimeoutMs);

  try {
    if (
      props.getProperty(
        C.snapshotProperty
      )
    ) {
      throw new Error(
        'Є незавершена LEGACY NONZERO транзакція. ' +
        'Спочатку запустіть ' +
        'recoverInterruptedLegacyNonzeroStatusStep3().'
      );
    }

    const plan =
      legacyNonzeroProductionBuildPlan_();

    if (
      !plan.ok ||
      !plan.canWrite
    ) {
      throw new Error(
        plan.reason ||
        'Історичний запис не дозволено проводити.'
      );
    }

    const registry =
      ss.getSheetByName(
        C.registrySheet
      );

    const accruals =
      ss.getSheetByName(
        C.accrualSheet
      );

    if (!registry || !accruals) {
      throw new Error(
        'Не знайдено реєстр вакцин або лист «Нарахування».'
      );
    }

    /*
     * Повторна перевірка запису
     * вже під блокуванням.
     */
    const current =
      registry
        .getRange(
          plan.registryRow,
          1,
          1,
          13
        )
        .getValues()[0];

    const currentChecks = {
      vaccineIdExact:
        legacyNonzeroProductionClean_(
          current[0]
        ) === plan.vaccineId,

      saleIdExact:
        legacyNonzeroProductionClean_(
          current[1]
        ) === plan.saleId,

      vaccineNameExact:
        legacyNonzeroProductionNormalize_(
          current[3]
        ) ===
        legacyNonzeroProductionNormalize_(
          plan.vaccineName
        ),

      storedCostExact:
        Math.abs(
          legacyNonzeroProductionNumber_(
            current[4]
          ) -
          plan.storedCost
        ) <= C.tolerance,

      currentStatusStored:
        legacyNonzeroProductionClean_(
          current[5]
        ) === 'На зберіганні',

      lotIdEmpty:
        legacyNonzeroProductionClean_(
          current[9]
        ) === '',

      sourceMovementIdEmpty:
        legacyNonzeroProductionClean_(
          current[12]
        ) === ''
    };

    const changedChecks =
      Object.keys(
        currentChecks
      ).filter(function(key) {
        return currentChecks[key] !== true;
      });

    if (changedChecks.length) {
      throw new Error(
        'Запис змінився після перевірки: ' +
        changedChecks.join(', ') +
        '.'
      );
    }

    const duplicateRows =
      legacyNonzeroProductionFindAccrualRows_(
        accruals,
        plan.vaccineId
      );

    if (duplicateRows.length) {
      throw new Error(
        'Для вакцини ' +
        plan.vaccineId +
        ' вже існує нарахування. ' +
        'Повторне проведення заблоковано.'
      );
    }

    const accrualRow =
      Math.max(
        accruals.getLastRow() + 1,
        2
      );

    const accrualRange =
      accruals.getRange(
        accrualRow,
        1,
        1,
        8
      );

    legacyNonzeroProductionRequireBlank_(
      accrualRange,
      'рядок нарахування ' +
      accrualRow
    );

    const accrualCategory =
      plan.newStatus === 'Використано'
        ? 'Продаж і використання'
        : 'Списання вакцин';

    const accrualMarker =
      C.markerPrefix +
      ' | ' +
      plan.newStatus +
      ' | ' +
      plan.vaccineId;

    const patient =
      plan.patient ||
      'Не вказано';

    snapshot = {
      version:
        C.version,

      createdAt:
        new Date().toISOString(),

      spreadsheetId:
        ss.getId(),

      registrySheet:
        C.registrySheet,

      registryRow:
        plan.registryRow,

      vaccineId:
        plan.vaccineId,

      registryCells: {
        status:
          legacyNonzeroProductionCellSnapshot_(
            registry.getRange(
              plan.registryRow,
              6
            )
          ),

        actualDate:
          legacyNonzeroProductionCellSnapshot_(
            registry.getRange(
              plan.registryRow,
              8
            )
          ),

        comment:
          legacyNonzeroProductionCellSnapshot_(
            registry.getRange(
              plan.registryRow,
              9
            )
          )
      },

      writtenStatus:
        plan.newStatus,

      writtenComment:
        legacyNonzeroProductionClean_(
          comment
        ),

      accrualSheet:
        C.accrualSheet,

      accrualRow:
        accrualRow,

      accrualFormats:
        accrualRange
          .getNumberFormats()[0],

      accrualMarker:
        accrualMarker
    };

    /*
     * Аварійний знімок створюється
     * до першої бізнес-зміни.
     */
    props.setProperty(
      C.snapshotProperty,
      JSON.stringify(snapshot)
    );

    /*
     * 1. Реєстр вакцин.
     */
    registry
      .getRange(
        plan.registryRow,
        6
      )
      .setValue(
        plan.newStatus
      );

    registry
      .getRange(
        plan.registryRow,
        8
      )
      .setValue(
        actualDate
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

    registry
      .getRange(
        plan.registryRow,
        9
      )
      .setValue(
        legacyNonzeroProductionClean_(
          comment
        )
      );

    /*
     * 2. Нарахування собівартості.
     */
    accrualRange.setValues([[
      plan.saleId,
      'Вакцина',
      actualDate,
      accrualCategory,
      plan.vaccineName,
      -Math.abs(
        plan.storedCost
      ),
      patient,
      accrualMarker
    ]]);

    accruals
      .getRange(
        accrualRow,
        3
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

    accruals
      .getRange(
        accrualRow,
        6
      )
      .setNumberFormat(
        '#,##0.00'
      );

    SpreadsheetApp.flush();

    /*
     * Післязаписний контроль.
     */
    const registryAfter =
      registry
        .getRange(
          plan.registryRow,
          1,
          1,
          13
        )
        .getValues()[0];

    const accrualAfter =
      accrualRange
        .getValues()[0];

    const afterChecks = {
      registryIdUnchanged:
        legacyNonzeroProductionClean_(
          registryAfter[0]
        ) === plan.vaccineId,

      registryStatusWritten:
        legacyNonzeroProductionClean_(
          registryAfter[5]
        ) === plan.newStatus,

      registryDateWritten:
        registryAfter[7] instanceof Date &&
        !isNaN(
          registryAfter[7].getTime()
        ),

      registryLotStillEmpty:
        legacyNonzeroProductionClean_(
          registryAfter[9]
        ) === '',

      registryMovementStillEmpty:
        legacyNonzeroProductionClean_(
          registryAfter[12]
        ) === '',

      accrualMarkerWritten:
        legacyNonzeroProductionClean_(
          accrualAfter[7]
        ) === accrualMarker,

      accrualAmountWritten:
        Math.abs(
          legacyNonzeroProductionNumber_(
            accrualAfter[5]
          ) +
          Math.abs(
            plan.storedCost
          )
        ) <= C.tolerance,

      accrualCategoryWritten:
        legacyNonzeroProductionClean_(
          accrualAfter[3]
        ) === accrualCategory
    };

    const failedAfterChecks =
      Object.keys(
        afterChecks
      ).filter(function(key) {
        return afterChecks[key] !== true;
      });

    if (failedAfterChecks.length) {
      throw new Error(
        'Післязаписний контроль не пройдено: ' +
        failedAfterChecks.join(', ') +
        '.'
      );
    }

    /*
     * Транзакцію повністю підтверджено.
     */
    props.deleteProperty(
      C.snapshotProperty
    );

    return {
      ok: true,

      version:
        C.version,

      classification:
        'LEGACY_UNLINKED_NONZERO_APPROVED',

      vaccineId:
        plan.vaccineId,

      saleId:
        plan.saleId,

      registryRow:
        plan.registryRow,

      previousStatus:
        plan.currentStatus,

      newStatus:
        plan.newStatus,

      actualDate:
        actualDate,

      storedCost:
        plan.storedCost,

      accrualRow:
        accrualRow,

      accrualAmount:
        -Math.abs(
          plan.storedCost
        ),

      accrualCategory:
        accrualCategory,

      accrualMarker:
        accrualMarker,

      registryWriteVerified:
        true,

      accrualWriteVerified:
        true,

      stockChanged:
        false,

      movementCreated:
        false,

      transactionCommitted:
        true
    };

  } catch (error) {
    let rollbackError = null;

    try {
      const raw =
        props.getProperty(
          C.snapshotProperty
        );

      const saved =
        raw
          ? JSON.parse(raw)
          : snapshot;

      if (saved) {
        legacyNonzeroProductionRestoreSnapshot_(
          ss,
          C,
          saved
        );

        props.deleteProperty(
          C.snapshotProperty
        );
      }

    } catch (recoveryError) {
      rollbackError =
        recoveryError;
    }

    if (rollbackError) {
      throw new Error(
        'LEGACY NONZERO транзакція завершилась помилкою, ' +
        'але відкат не підтверджено. ' +
        'Аварійний знімок збережено. ' +
        'Первинна помилка: ' +
        legacyNonzeroProductionError_(
          error
        ) +
        '. Помилка відкату: ' +
        legacyNonzeroProductionError_(
          rollbackError
        )
      );
    }

    throw new Error(
      'LEGACY NONZERO транзакцію не проведено. ' +
      'Попередній стан відновлено. Причина: ' +
      legacyNonzeroProductionError_(
        error
      )
    );

  } finally {
    lock.releaseLock();
  }
}


/**
 * Dry-run обраної у формі вакцини.
 * Нічого не записує.
 */
function previewLegacyNonzeroProductionStep3() {
  const plan =
    legacyNonzeroProductionBuildPlan_();

  const result = {
    ok:
      plan.ok,

    canWrite:
      plan.canWrite,

    test:
      'previewLegacyNonzeroProductionStep3',

    version:
      '3.0-production-dry-run',

    classification:
      plan.classification,

    reason:
      plan.reason,

    branch:
      plan.branch,

    vaccineId:
      plan.vaccineId,

    saleId:
      plan.saleId,

    vaccineName:
      plan.vaccineName,

    registryRow:
      plan.registryRow,

    storedCost:
      plan.storedCost,

    currentStatus:
      plan.currentStatus,

    requestedStatus:
      plan.newStatus,

    futureAction:
      'F/H/I реєстру + одне нарахування -E',

    stockWillChange:
      false,

    movementWillBeCreated:
      false,

    businessValuesChanged:
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


/**
 * Dry-run після підключення маршруту.
 *
 * Перевіряє код і всі дозволені записи.
 * Нічого не записує.
 */
function verifyLegacyNonzeroProductionActivationStep3() {
  const C =
    legacyNonzeroProductionConfig_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const branch =
    legacyNonzeroProductionResolveBranch_(
      ss.getName(),
      C
    );

  const registry =
    ss.getSheetByName(
      C.registrySheet
    );

  const accruals =
    ss.getSheetByName(
      C.accrualSheet
    );

  if (!registry || !accruals) {
    throw new Error(
      'Не знайдено реєстр вакцин або «Нарахування».'
    );
  }

  const registryRows =
    registry.getLastRow() >= 2
      ? registry
          .getRange(
            2,
            1,
            registry.getLastRow() - 1,
            13
          )
          .getValues()
      : [];

  const routeSource =
    typeof updateVaccineStatusFromInput_ ===
      'function'
      ? String(
          updateVaccineStatusFromInput_
        )
      : '';

  const records =
    C.allowlists[branch].map(
      function(expected) {
        const matches = [];

        registryRows.forEach(
          function(row, index) {
            if (
              legacyNonzeroProductionClean_(
                row[0]
              ) === expected.vaccineId
            ) {
              matches.push({
                rowNumber:
                  index + 2,

                values:
                  row
              });
            }
          }
        );

        const record =
          matches.length === 1
            ? matches[0]
            : null;

        const row =
          record
            ? record.values
            : [];

        const checks = {
          existsExactlyOnce:
            matches.length === 1,

          nameExact:
            legacyNonzeroProductionNormalize_(
              row[3]
            ) ===
            legacyNonzeroProductionNormalize_(
              expected.vaccineName
            ),

          costExact:
            Math.abs(
              legacyNonzeroProductionNumber_(
                row[4]
              ) -
              expected.storedCost
            ) <= C.tolerance,

          statusStored:
            legacyNonzeroProductionClean_(
              row[5]
            ) === 'На зберіганні',

          lotEmpty:
            legacyNonzeroProductionClean_(
              row[9]
            ) === '',

          movementEmpty:
            legacyNonzeroProductionClean_(
              row[12]
            ) === '',

          noAccrualDuplicate:
            legacyNonzeroProductionFindAccrualRows_(
              accruals,
              expected.vaccineId
            ).length === 0
        };

        const failedChecks =
          Object.keys(
            checks
          ).filter(function(key) {
            return checks[key] !== true;
          });

        return {
          ready:
            failedChecks.length === 0,

          registryRow:
            record
              ? record.rowNumber
              : 0,

          vaccineId:
            expected.vaccineId,

          vaccineName:
            expected.vaccineName,

          storedCost:
            expected.storedCost,

          checks:
            checks,

          failedChecks:
            failedChecks
        };
      }
    );

  const readyRecords =
    records.filter(
      function(record) {
        return record.ready;
      }
    ).length;

  const dependencyChecks = {
    executorExists:
      typeof executeLegacyNonzeroStoredVaccineStatus_ ===
      'function',

    recoveryExists:
      typeof recoverInterruptedLegacyNonzeroStatusStep3 ===
      'function',

    routeFunctionExists:
      typeof updateVaccineStatusFromInput_ ===
      'function',

    routeCallsExecutor:
      routeSource.indexOf(
        'executeLegacyNonzeroStoredVaccineStatus_'
      ) !== -1,

    noEmergencySnapshot:
      !PropertiesService
        .getDocumentProperties()
        .getProperty(
          C.snapshotProperty
        ),

    everyAllowedRecordReady:
      readyRecords === records.length
  };

  const failedDependencies =
    Object.keys(
      dependencyChecks
    ).filter(function(key) {
      return dependencyChecks[key] !== true;
    });

  const result = {
    ok:
      failedDependencies.length === 0,

    readyForOneProtectedProductionOperation:
      failedDependencies.length === 0,

    test:
      'verifyLegacyNonzeroProductionActivationStep3',

    version:
      '3.0-production-activation-dry-run',

    spreadsheet:
      ss.getName(),

    branch:
      branch,

    expectedRecords:
      records.length,

    readyRecords:
      readyRecords,

    blockedRecords:
      records.length -
      readyRecords,

    dependencyChecks:
      dependencyChecks,

    failedDependencies:
      failedDependencies,

    records:
      records,

    businessValuesChanged:
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


/**
 * Аварійне відновлення перерваної
 * виробничої транзакції.
 */
function recoverInterruptedLegacyNonzeroStatusStep3() {
  const C =
    legacyNonzeroProductionConfig_();

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
        C.snapshotProperty
      );

    if (!raw) {
      const nothing = {
        ok: true,

        recovered:
          false,

        reason:
          'Незавершеної LEGACY NONZERO транзакції немає.'
      };

      Logger.log(
        JSON.stringify(
          nothing,
          null,
          2
        )
      );

      return nothing;
    }

    const snapshot =
      JSON.parse(raw);

    legacyNonzeroProductionRestoreSnapshot_(
      ss,
      C,
      snapshot
    );

    props.deleteProperty(
      C.snapshotProperty
    );

    const result = {
      ok: true,

      recovered:
        true,

      vaccineId:
        snapshot.vaccineId,

      businessValuesChangedAfterRecovery:
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


function legacyNonzeroProductionBuildPlan_() {
  const C =
    legacyNonzeroProductionConfig_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const branch =
    legacyNonzeroProductionResolveBranch_(
      ss.getName(),
      C
    );

  const input =
    ss.getSheetByName(
      C.inputSheet
    );

  const registry =
    ss.getSheetByName(
      C.registrySheet
    );

  const accruals =
    ss.getSheetByName(
      C.accrualSheet
    );

  if (
    !input ||
    !registry ||
    !accruals
  ) {
    throw new Error(
      'Не знайдено форму, реєстр вакцин або «Нарахування».'
    );
  }

  const selectedCell =
    input.getRange('D13');

  const vaccineId =
    legacyNonzeroProductionExtractId_(
      selectedCell.getDisplayValue(),
      selectedCell.getNote()
    );

  const newStatus =
    legacyNonzeroProductionClean_(
      input
        .getRange('F13')
        .getDisplayValue()
    );

  if (!vaccineId) {
    throw new Error(
      'У D13 не визначено ID вакцини.'
    );
  }

  if (
    newStatus !== 'Використано' &&
    newStatus !== 'Списано'
  ) {
    throw new Error(
      'У F13 оберіть «Використано» або «Списано».'
    );
  }

  const allowed =
    C.allowlists[branch].filter(
      function(item) {
        return (
          item.vaccineId === vaccineId
        );
      }
    );

  if (allowed.length !== 1) {
    return {
      ok: false,

      canWrite: false,

      classification:
        'LEGACY_NONZERO_NOT_ALLOWLISTED',

      reason:
        'ID ' +
        vaccineId +
        ' відсутній у закритому списку філії ' +
        branch +
        '.',

      branch:
        branch,

      vaccineId:
        vaccineId,

      newStatus:
        newStatus
    };
  }

  const registryRows =
    registry.getLastRow() >= 2
      ? registry
          .getRange(
            2,
            1,
            registry.getLastRow() - 1,
            13
          )
          .getValues()
      : [];

  const matches = [];

  registryRows.forEach(
    function(row, index) {
      if (
        legacyNonzeroProductionClean_(
          row[0]
        ) === vaccineId
      ) {
        matches.push({
          rowNumber:
            index + 2,

          values:
            row
        });
      }
    }
  );

  if (matches.length !== 1) {
    return {
      ok: false,

      canWrite: false,

      classification:
        'BLOCKED',

      reason:
        'У реєстрі знайдено ' +
        matches.length +
        ' записів для ID ' +
        vaccineId +
        '.',

      branch:
        branch,

      vaccineId:
        vaccineId,

      newStatus:
        newStatus
    };
  }

  const expected =
    allowed[0];

  const row =
    matches[0].values;

  const plan = {
    ok: false,

    canWrite: false,

    classification:
      'LEGACY_UNLINKED_NONZERO_APPROVED',

    reason:
      '',

    branch:
      branch,

    registryRow:
      matches[0].rowNumber,

    vaccineId:
      legacyNonzeroProductionClean_(
        row[0]
      ),

    saleId:
      legacyNonzeroProductionClean_(
        row[1]
      ),

    patient:
      legacyNonzeroProductionClean_(
        row[2]
      ) ||
      'Не вказано',

    vaccineName:
      legacyNonzeroProductionClean_(
        row[3]
      ),

    storedCost:
      legacyNonzeroProductionNumber_(
        row[4]
      ),

    currentStatus:
      legacyNonzeroProductionClean_(
        row[5]
      ),

    lotId:
      legacyNonzeroProductionClean_(
        row[9]
      ),

    sourceMovementId:
      legacyNonzeroProductionClean_(
        row[12]
      ),

    newStatus:
      newStatus
  };

  const checks = {
    saleIdPresent:
      Boolean(plan.saleId),

    vaccineNameExact:
      legacyNonzeroProductionNormalize_(
        plan.vaccineName
      ) ===
      legacyNonzeroProductionNormalize_(
        expected.vaccineName
      ),

    storedCostExact:
      Math.abs(
        plan.storedCost -
        expected.storedCost
      ) <= C.tolerance,

    storedCostPositive:
      plan.storedCost >
      C.tolerance,

    currentStatusStored:
      plan.currentStatus ===
      'На зберіганні',

    lotIdEmpty:
      plan.lotId === '',

    sourceMovementIdEmpty:
      plan.sourceMovementId === '',

    noExistingAccrual:
      legacyNonzeroProductionFindAccrualRows_(
        accruals,
        vaccineId
      ).length === 0
  };

  const failedChecks =
    Object.keys(
      checks
    ).filter(function(key) {
      return checks[key] !== true;
    });

  if (failedChecks.length) {
    plan.classification =
      'BLOCKED';

    plan.reason =
      'Запис не пройшов перевірки: ' +
      failedChecks.join(', ') +
      '.';

    return plan;
  }

  plan.ok =
    true;

  plan.canWrite =
    true;

  plan.reason =
    'Точний історичний запис підтверджено закритим списком.';

  return plan;
}


function legacyNonzeroProductionRestoreSnapshot_(
  ss,
  C,
  snapshot
) {
  if (
    snapshot.spreadsheetId &&
    snapshot.spreadsheetId !==
      ss.getId()
  ) {
    throw new Error(
      'Аварійний знімок належить іншій таблиці.'
    );
  }

  const registry =
    ss.getSheetByName(
      snapshot.registrySheet
    );

  const accruals =
    ss.getSheetByName(
      snapshot.accrualSheet
    );

  if (!registry || !accruals) {
    throw new Error(
      'Не знайдено лист для аварійного відновлення.'
    );
  }

  if (
    legacyNonzeroProductionClean_(
      registry
        .getRange(
          snapshot.registryRow,
          1
        )
        .getValue()
    ) !== snapshot.vaccineId
  ) {
    throw new Error(
      'Рядок реєстру не відповідає аварійному знімку.'
    );
  }

  const accrualRange =
    accruals.getRange(
      snapshot.accrualRow,
      1,
      1,
      8
    );

  const currentMarker =
    legacyNonzeroProductionClean_(
      accrualRange
        .getCell(1, 8)
        .getValue()
    );

  if (
    currentMarker &&
    currentMarker !==
      snapshot.accrualMarker
  ) {
    throw new Error(
      'Рядок аварійного нарахування зайнято іншим записом.'
    );
  }

  legacyNonzeroProductionRestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      6
    ),
    snapshot.registryCells.status
  );

  legacyNonzeroProductionRestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      8
    ),
    snapshot.registryCells.actualDate
  );

  legacyNonzeroProductionRestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      9
    ),
    snapshot.registryCells.comment
  );

  if (
    currentMarker ===
    snapshot.accrualMarker
  ) {
    accrualRange.clearContent();

    accrualRange.setNumberFormats([
      snapshot.accrualFormats
    ]);
  }

  SpreadsheetApp.flush();

  legacyNonzeroProductionVerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      6
    ),
    snapshot.registryCells.status,
    'статус'
  );

  legacyNonzeroProductionVerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      8
    ),
    snapshot.registryCells.actualDate,
    'фактична дата'
  );

  legacyNonzeroProductionVerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      9
    ),
    snapshot.registryCells.comment,
    'коментар'
  );

  if (
    legacyNonzeroProductionClean_(
      accruals
        .getRange(
          snapshot.accrualRow,
          8
        )
        .getValue()
    ) === snapshot.accrualMarker
  ) {
    throw new Error(
      'Нарахування залишилося після аварійного відновлення.'
    );
  }
}


function legacyNonzeroProductionConfig_() {
  return {
    version:
      '3.0-closed-allowlist-production',

    snapshotProperty:
      'PROFIN_LEGACY_NONZERO_ACTIVE_TRANSACTION',

    markerPrefix:
      'LEGACY NONZERO STATUS COST',

    lockTimeoutMs:
      30000,

    tolerance:
      0.000001,

    inputSheet:
      'Ввід операцій',

    registrySheet:
      'Облік вакцин',

    accrualSheet:
      'Нарахування',

    allowlists: {
      ALTERNATIVE: [
        {
          vaccineId:
            'VAC-20260616-779-V1',

          vaccineName:
            'Інфанрикс гекса',

          storedCost:
            4600
        },
        {
          vaccineId:
            'VAC-20260616-779-V2',

          vaccineName:
            'Інфанрикс гекса',

          storedCost:
            4600
        },
        {
          vaccineId:
            'VAC-20260616-555-V1',

          vaccineName:
            'Ротарикс',

          storedCost:
            3300
        },
        {
          vaccineId:
            'VAC-20260616-555-V2',

          vaccineName:
            'Ротарикс',

          storedCost:
            3300
        },
        {
          vaccineId:
            'VAC-20260616-478-V1',

          vaccineName:
            'Ваксньюванс',

          storedCost:
            6200
        },
        {
          vaccineId:
            'VAC-20260616-478-V2',

          vaccineName:
            'Ваксньюванс',

          storedCost:
            6200
        }
      ],

      BABURKA: [
        {
          vaccineId:
            'VAC-20260706-687-1',

          vaccineName:
            'Гардасил',

          storedCost:
            5800
        },
        {
          vaccineId:
            'VAC-20260706-974-1',

          vaccineName:
            'Бексеро',

          storedCost:
            4200
        },
        {
          vaccineId:
            'VAC-20260706-731-1',

          vaccineName:
            'Бексеро',

          storedCost:
            4200
        },
        {
          vaccineId:
            'VAC-20260706-797-2',

          vaccineName:
            'Бексеро',

          storedCost:
            4200
        },
        {
          vaccineId:
            'VAC-20260710-456-1',

          vaccineName:
            'Бексеро',

          storedCost:
            4500
        },
        {
          vaccineId:
            'VAC-20260710-982-1',

          vaccineName:
            'Бексеро',

          storedCost:
            4500
        },
        {
          vaccineId:
            'VAC-20260713-669-1',

          vaccineName:
            'Бустрикс поліо',

          storedCost:
            1500
        },
        {
          vaccineId:
            'VAC-20260716-988-V1',

          vaccineName:
            'Бексеро',

          storedCost:
            4500
        },
        {
          vaccineId:
            'VAC-20260717-221-V1',

          vaccineName:
            'Гардасил',

          storedCost:
            5800
        },
        {
          vaccineId:
            'VAC-20260717-685-V1',

          vaccineName:
            'Гардасил',

          storedCost:
            5800
        }
      ]
    }
  };
}


function legacyNonzeroProductionResolveBranch_(
  spreadsheetName,
  C
) {
  const name =
    legacyNonzeroProductionNormalize_(
      spreadsheetName
    );

  if (
    name.indexOf('бабурка') !== -1
  ) {
    return 'BABURKA';
  }

  if (
    name.indexOf('альтернатива') !== -1
  ) {
    return 'ALTERNATIVE';
  }

  throw new Error(
    'Не вдалося визначити філію з назви таблиці.'
  );
}


function legacyNonzeroProductionFindAccrualRows_(
  sheet,
  vaccineId
) {
  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {
    return [];
  }

  const values =
    sheet
      .getRange(
        2,
        8,
        sheet.getLastRow() - 1,
        1
      )
      .getValues();

  const rows = [];

  values.forEach(
    function(row, index) {
      if (
        legacyNonzeroProductionClean_(
          row[0]
        ).indexOf(vaccineId) !== -1
      ) {
        rows.push(
          index + 2
        );
      }
    }
  );

  return rows;
}


function legacyNonzeroProductionExtractId_(
  displayValue,
  note
) {
  const text =
    legacyNonzeroProductionClean_(
      displayValue
    ) +
    '\n' +
    legacyNonzeroProductionClean_(
      note
    );

  const match =
    text.match(
      /VAC-[A-Za-z0-9_-]+/i
    );

  return match
    ? legacyNonzeroProductionClean_(
        match[0]
      )
    : '';
}


function legacyNonzeroProductionRequireBlank_(
  range,
  label
) {
  const values =
    range.getValues()[0];

  const formulas =
    range.getFormulas()[0];

  const occupied =
    values.some(
      function(value, index) {
        return (
          legacyNonzeroProductionClean_(
            value
          ) !== '' ||
          formulas[index] !== ''
        );
      }
    );

  if (occupied) {
    throw new Error(
      'Неочікувано зайнятий ' +
      label +
      '.'
    );
  }
}


function legacyNonzeroProductionCellSnapshot_(
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
            type: 'DATE',
            value: value.toISOString()
          }
        : {
            type: 'VALUE',
            value: value
          },

    numberFormat:
      range.getNumberFormat()
  };
}


function legacyNonzeroProductionRestoreCell_(
  range,
  snapshot
) {
  if (snapshot.formula) {
    range.setFormula(
      snapshot.formula
    );

  } else if (
    snapshot.value &&
    snapshot.value.type === 'DATE'
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


function legacyNonzeroProductionVerifyCell_(
  range,
  snapshot,
  label
) {
  if (
    range.getFormula() !==
    (snapshot.formula || '')
  ) {
    throw new Error(
      'Не відновлено формулу: ' +
      label +
      '.'
    );
  }

  if (snapshot.formula) {
    return;
  }

  const actual =
    range.getValue();

  const actualText =
    actual instanceof Date
      ? 'DATE|' +
        actual.toISOString()
      : 'VALUE|' +
        String(
          actual == null
            ? ''
            : actual
        );

  const expectedText =
    snapshot.value.type === 'DATE'
      ? 'DATE|' +
        snapshot.value.value
      : 'VALUE|' +
        String(
          snapshot.value.value == null
            ? ''
            : snapshot.value.value
        );

  if (
    actualText !== expectedText
  ) {
    throw new Error(
      'Не відновлено значення: ' +
      label +
      '.'
    );
  }
}


function legacyNonzeroProductionClean_(
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


function legacyNonzeroProductionNormalize_(
  value
) {
  return legacyNonzeroProductionClean_(
    value
  ).toLowerCase();
}


function legacyNonzeroProductionNumber_(
  value
) {
  if (
    typeof value === 'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  const parsed =
    Number(
      legacyNonzeroProductionClean_(
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


function legacyNonzeroProductionError_(
  error
) {
  return (
    error &&
    error.message
  )
    ? error.message
    : String(error);
}