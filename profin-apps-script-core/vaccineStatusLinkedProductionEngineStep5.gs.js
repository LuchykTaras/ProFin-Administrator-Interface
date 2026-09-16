/**
 * PROFIN OS — ЗМІНА СТАТУСУ ВАКЦИНИ
 * КРОК 5. ВИРОБНИЧИЙ LINKED-ВИКОНАВЕЦЬ
 *
 * — ще НЕ підключений до робочої кнопки;
 * — працює лише з LINKED_EXACT;
 * — LEGACY_UNLINKED та BROKEN_LINK блокує;
 * — має аварійний знімок і повний відкат;
 * — проводить склад, рух, реєстр і нарахування.
 */

function executeLinkedStoredVaccineStatusV2_(
  actualDate,
  comment
) {
  const C = {
    version:
      '5.0-production-inactive',

    registrySheet:
      'Облік вакцин',

    stockSheet:
      'Склад медичних запасів',

    movementSheet:
      'Рух складу',

    accrualSheet:
      'Нарахування',

    snapshotProperty:
      'PROFIN_VACCINE_V2_ACTIVE_TRANSACTION',

    lockTimeoutMs:
      30000,

    tolerance:
      0.000001
  };

  if (
    !(
      actualDate instanceof
      Date
    ) ||
    isNaN(
      actualDate.getTime()
    )
  ) {
    throw new Error(
      'LINKED-виконавець потребує коректну фактичну дату.'
    );
  }

  const lock =
    LockService
      .getDocumentLock();

  lock.waitLock(
    C.lockTimeoutMs
  );

  const props =
    PropertiesService
      .getDocumentProperties();

  let snapshot = null;

  try {
    if (
      props.getProperty(
        C.snapshotProperty
      )
    ) {
      throw new Error(
        'Є незавершена LINKED-транзакція. ' +
        'Спочатку запустіть ' +
        'recoverInterruptedLinkedStoredVaccineStatusV2().'
      );
    }

    if (
      typeof previewLinkedStoredVaccineEngineStep2 !==
      'function'
    ) {
      throw new Error(
        'Не знайдено перевірений планувальник кроку 2.'
      );
    }

    /*
     * План будується під документним блокуванням.
     */
    const plan =
      previewLinkedStoredVaccineEngineStep2();

    if (
      !plan ||
      plan.ok !== true ||
      plan.canWrite !== true ||
      plan.classification !==
        'LINKED_EXACT'
    ) {
      throw new Error(
        'Виробничий запис заблоковано. ' +
        (
          plan && plan.reason
            ? plan.reason
            : 'Немає безпечного LINKED_EXACT-плану.'
        )
      );
    }

    const vaccine =
      plan.vaccine || {};

    const vaccineId =
      step5Clean_(
        vaccine.vaccineId ||
        plan.vaccineId
      );

    const saleId =
      step5Clean_(
        vaccine.saleId ||
        plan.saleId
      );

    const vaccineName =
      step5Clean_(
        vaccine.vaccineName ||
        plan.vaccineName
      );

    const currentStatus =
      step5Clean_(
        vaccine.currentStatus ||
        plan.fromStatus
      );

    const newStatus =
      step5Clean_(
        vaccine.newStatus ||
        plan.toStatus
      );

    const lotId =
      step5Clean_(
        vaccine.lotId ||
        plan.lotId
      );

    const sourceMovementId =
      step5Clean_(
        vaccine.sourceMovementId ||
        plan.sourceMovementId
      );

    const registryRow =
      Number(
        vaccine.registryRow ||
        plan.registryRow ||
        0
      );

    const stockRow =
      Number(
        plan.stockBefore &&
        plan.stockBefore.row ||
        0
      );

    const quantity =
      step5Number_(
        plan.quantity
      );

    const unitCost =
      step5Number_(
        plan.unitCost
      );

    const syncOperationId =
      step5Clean_(
        plan.syncOperationId
      );

    if (
      !vaccineId ||
      !saleId ||
      !vaccineName ||
      !lotId ||
      !sourceMovementId ||
      !registryRow ||
      !stockRow ||
      !syncOperationId
    ) {
      throw new Error(
        'LINKED-план не містить усіх обов’язкових реквізитів.'
      );
    }

    if (
      currentStatus !==
      'На зберіганні'
    ) {
      throw new Error(
        'Дозволений лише перехід зі статусу «На зберіганні».'
      );
    }

    if (
      newStatus !== 'Використано' &&
      newStatus !== 'Списано'
    ) {
      throw new Error(
        'Недопустимий новий статус: ' +
        newStatus
      );
    }

    if (
      Math.abs(
        quantity - 1
      ) >
        C.tolerance ||
      unitCost < 0
    ) {
      throw new Error(
        'Некоректна кількість або собівартість LINKED-операції.'
      );
    }

    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const registry =
      ss.getSheetByName(
        C.registrySheet
      );

    const stock =
      ss.getSheetByName(
        C.stockSheet
      );

    const movements =
      ss.getSheetByName(
        C.movementSheet
      );

    const accruals =
      ss.getSheetByName(
        C.accrualSheet
      );

    if (
      !registry ||
      !stock ||
      !movements ||
      !accruals
    ) {
      throw new Error(
        'Не знайдено реєстр, склад, рухи або нарахування.'
      );
    }

    const registryValues =
      registry
        .getRange(
          registryRow,
          1,
          1,
          13
        )
        .getValues()[0];

    if (
      step5Clean_(
        registryValues[0]
      ) !== vaccineId ||

      step5Clean_(
        registryValues[1]
      ) !== saleId ||

      step5Clean_(
        registryValues[3]
      ) !== vaccineName ||

      step5Clean_(
        registryValues[5]
      ) !==
        'На зберіганні' ||

      step5Clean_(
        registryValues[9]
      ) !== lotId ||

      step5Clean_(
        registryValues[12]
      ) !== sourceMovementId
    ) {
      throw new Error(
        'Реєстр змінився після побудови плану. ' +
        'Запис зупинено.'
      );
    }

    if (
      step5Clean_(
        stock
          .getRange(
            stockRow,
            1
          )
          .getValue()
      ) !== lotId
    ) {
      throw new Error(
        'Складська партія змінилася після побудови плану.'
      );
    }

    /*
     * Захист від повторного складського руху.
     */
    if (
      step5ColumnContains_(
        movements,
        2,
        syncOperationId
      )
    ) {
      throw new Error(
        'Рух із ID ' +
        syncOperationId +
        ' уже існує. Повтор заблоковано.'
      );
    }

    const usageMarker =
      'Списання собівартості вакцини зі зберігання: ' +
      vaccineId;

    const writeOffMarker =
      'Списання вакцини без використання: ' +
      vaccineId;

    const accrualMarker =
      newStatus ===
      'Використано'
        ? usageMarker
        : writeOffMarker;

    /*
     * Захист від повторного нарахування.
     */
    if (
      step5ColumnContains_(
        accruals,
        8,
        usageMarker
      ) ||
      step5ColumnContains_(
        accruals,
        8,
        writeOffMarker
      )
    ) {
      throw new Error(
        'Для вакцини вже існує результатне нарахування. ' +
        'Повтор заблоковано.'
      );
    }

    /*
     * L — Продано / використано
     * M — Передано на зберігання
     * N — Списано
     */
    const stockRange =
      stock.getRange(
        stockRow,
        12,
        1,
        3
      );

    const stockBefore =
      stockRange
        .getValues()[0]
        .map(
          step5Number_
        );

    step5AssertNumber_(
      'L',
      stockBefore[0],
      plan.stockBefore.soldOrUsed,
      C.tolerance
    );

    step5AssertNumber_(
      'M',
      stockBefore[1],
      plan.stockBefore.transferredToStorage,
      C.tolerance
    );

    step5AssertNumber_(
      'N',
      stockBefore[2],
      plan.stockBefore.writtenOff,
      C.tolerance
    );

    if (
      stockBefore[1] +
      C.tolerance <
      1
    ) {
      throw new Error(
        'У партії недостатньо одиниць на зберіганні.'
      );
    }

    const movementRow =
      Math.max(
        movements.getLastRow() + 1,
        2
      );

    const accrualRow =
      Math.max(
        accruals.getLastRow() + 1,
        2
      );

    const movementRange =
      movements.getRange(
        movementRow,
        1,
        1,
        12
      );

    const accrualRange =
      accruals.getRange(
        accrualRow,
        1,
        1,
        8
      );

    step5RequireBlank_(
      movementRange,
      'рядок руху ' +
      movementRow
    );

    step5RequireBlank_(
      accrualRange,
      'рядок нарахування ' +
      accrualRow
    );

    const movementId =
      syncOperationId +
      '-MOV-1';

    /*
     * Аварійний знімок створюється
     * до першої бізнес-зміни.
     */
    snapshot = {
      version:
        C.version,

      createdAt:
        new Date().toISOString(),

      registrySheet:
        C.registrySheet,

      registryRow:
        registryRow,

      vaccineId:
        vaccineId,

      registryCells: {
        status:
          step5CellSnapshot_(
            registry.getRange(
              registryRow,
              6
            )
          ),

        actualDate:
          step5CellSnapshot_(
            registry.getRange(
              registryRow,
              8
            )
          ),

        comment:
          step5CellSnapshot_(
            registry.getRange(
              registryRow,
              9
            )
          )
      },

      stockSheet:
        C.stockSheet,

      stockRow:
        stockRow,

      lotId:
        lotId,

      stockCells: [
        step5CellSnapshot_(
          stock.getRange(
            stockRow,
            12
          )
        ),

        step5CellSnapshot_(
          stock.getRange(
            stockRow,
            13
          )
        ),

        step5CellSnapshot_(
          stock.getRange(
            stockRow,
            14
          )
        )
      ],

      movementSheet:
        C.movementSheet,

      movementRow:
        movementRow,

      movementFormats:
        movementRange
          .getNumberFormats()[0],

      syncOperationId:
        syncOperationId,

      movementId:
        movementId,

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

    props.setProperty(
      C.snapshotProperty,
      JSON.stringify(
        snapshot
      )
    );

    const stockAfter = [
      stockBefore[0] +
        (
          newStatus ===
          'Використано'
            ? 1
            : 0
        ),

      stockBefore[1] - 1,

      stockBefore[2] +
        (
          newStatus ===
          'Списано'
            ? 1
            : 0
        )
    ];

    const movementType =
      newStatus ===
      'Використано'
        ? 'Використання зі зберігання'
        : 'Списання';

    const patient =
      step5Clean_(
        registryValues[2]
      ) ||
      'Не вказано';

    const accrualCategory =
      newStatus ===
      'Використано'
        ? 'Продаж і використання'
        : 'Списання вакцин';

    const userEmail =
      typeof getSafeUserEmail_ ===
      'function'
        ? getSafeUserEmail_()
        : '';

    /*
     * 1. Перекласифікація складу.
     */
    stockRange.setValues([
      stockAfter
    ]);

    /*
     * 2. Рух складу.
     */
    movementRange.setValues([
      [
        movementId,
        syncOperationId,
        actualDate,
        'Вакцина',
        vaccineName,
        lotId,
        movementType,
        1,
        unitCost,
        step5RoundMoney_(
          unitCost
        ),
        userEmail,
        new Date()
      ]
    ]);

    movements
      .getRange(
        movementRow,
        3
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

    movements
      .getRange(
        movementRow,
        8
      )
      .setNumberFormat(
        '#,##0'
      );

    movements
      .getRange(
        movementRow,
        9,
        1,
        2
      )
      .setNumberFormat(
        '#,##0.00'
      );

    movements
      .getRange(
        movementRow,
        12
      )
      .setNumberFormat(
        'dd.MM.yyyy HH:mm:ss'
      );

    /*
     * 3. Реєстр вакцин.
     */
    registry
      .getRange(
        registryRow,
        6
      )
      .setValue(
        newStatus
      );

    registry
      .getRange(
        registryRow,
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
        registryRow,
        9
      )
      .setValue(
        step5Clean_(
          comment
        )
      );

    /*
     * 4. P&L-нарахування.
     */
    accrualRange.setValues([
      [
        saleId,
        'Вакцина',
        actualDate,
        accrualCategory,
        vaccineName,
        -Math.abs(
          unitCost
        ),
        patient,
        accrualMarker
      ]
    ]);

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
     * Післязаписна перевірка складу.
     */
    const actualStockAfter =
      stockRange
        .getValues()[0]
        .map(
          step5Number_
        );

    stockAfter.forEach(
      function(
        expected,
        index
      ) {
        step5AssertNumber_(
          'L:N після запису, індекс ' +
          index,
          actualStockAfter[index],
          expected,
          C.tolerance
        );
      }
    );

    /*
     * Перевірка руху.
     */
    if (
      step5Clean_(
        movementRange
          .getCell(
            1,
            1
          )
          .getValue()
      ) !==
        movementId ||

      step5Clean_(
        movementRange
          .getCell(
            1,
            2
          )
          .getValue()
      ) !==
        syncOperationId
    ) {
      throw new Error(
        'Створений рух не пройшов контроль.'
      );
    }

    /*
     * Перевірка реєстру.
     */
    if (
      step5Clean_(
        registry
          .getRange(
            registryRow,
            6
          )
          .getValue()
      ) !==
        newStatus ||

      !(
        registry
          .getRange(
            registryRow,
            8
          )
          .getValue()
        instanceof Date
      )
    ) {
      throw new Error(
        'Оновлення реєстру не пройшло контроль.'
      );
    }

    /*
     * Перевірка нарахування.
     */
    const writtenAccrual =
      accrualRange
        .getValues()[0];

    if (
      step5Clean_(
        writtenAccrual[7]
      ) !==
        accrualMarker ||

      Math.abs(
        step5Number_(
          writtenAccrual[5]
        ) +
        Math.abs(
          unitCost
        )
      ) >
        C.tolerance
    ) {
      throw new Error(
        'Нарахування не пройшло контроль.'
      );
    }

    /*
     * Усі блоки підтверджені.
     */
    props.deleteProperty(
      C.snapshotProperty
    );

    return {
      ok: true,

      version:
        C.version,

      classification:
        'LINKED_EXACT',

      vaccineId:
        vaccineId,

      saleId:
        saleId,

      previousStatus:
        currentStatus,

      newStatus:
        newStatus,

      actualDate:
        actualDate,

      lotId:
        lotId,

      sourceMovementId:
        sourceMovementId,

      syncOperationId:
        syncOperationId,

      movementId:
        movementId,

      movementRow:
        movementRow,

      accrualRow:
        accrualRow,

      stockRow:
        stockRow,

      stockBefore: {
        soldOrUsed:
          stockBefore[0],

        transferredToStorage:
          stockBefore[1],

        writtenOff:
          stockBefore[2]
      },

      stockAfter: {
        soldOrUsed:
          actualStockAfter[0],

        transferredToStorage:
          actualStockAfter[1],

        writtenOff:
          actualStockAfter[2]
      },

      movementWriteVerified:
        true,

      registryWriteVerified:
        true,

      accrualWriteVerified:
        true,

      transactionCommitted:
        true
    };

  } catch (
    error
  ) {
    let rollbackError =
      null;

    try {
      const raw =
        props.getProperty(
          C.snapshotProperty
        );

      const saved =
        raw
          ? JSON.parse(
              raw
            )
          : snapshot;

      if (
        saved
      ) {
        step5RollbackTransaction_(
          saved,
          C
        );

        props.deleteProperty(
          C.snapshotProperty
        );
      }

    } catch (
      recoveryError
    ) {
      rollbackError =
        recoveryError;
    }

    if (
      rollbackError
    ) {
      throw new Error(
        'LINKED-транзакція завершилась помилкою, ' +
        'автоматичний відкат не підтверджено. ' +
        'Знімок збережено. Первинна помилка: ' +
        step5Error_(
          error
        ) +
        '. Помилка відкату: ' +
        step5Error_(
          rollbackError
        )
      );
    }

    throw new Error(
      'LINKED-транзакцію не проведено. ' +
      'Попередній стан відновлено. Причина: ' +
      step5Error_(
        error
      )
    );

  } finally {
    lock.releaseLock();
  }
}


/**
 * Аварійне відновлення після
 * перерваного виконання.
 */
function recoverInterruptedLinkedStoredVaccineStatusV2() {
  const C = {
    snapshotProperty:
      'PROFIN_VACCINE_V2_ACTIVE_TRANSACTION',

    tolerance:
      0.000001
  };

  const lock =
    LockService
      .getDocumentLock();

  lock.waitLock(
    30000
  );

  try {
    const props =
      PropertiesService
        .getDocumentProperties();

    const raw =
      props.getProperty(
        C.snapshotProperty
      );

    if (
      !raw
    ) {
      const result = {
        ok: true,

        recovered:
          false,

        reason:
          'Незавершеної LINKED-транзакції немає.'
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

    const snapshot =
      JSON.parse(
        raw
      );

    step5RollbackTransaction_(
      snapshot,
      C
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

      lotId:
        snapshot.lotId,

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


/**
 * Повний відкат транзакції.
 */
function step5RollbackTransaction_(
  snapshot,
  config
) {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const registry =
    ss.getSheetByName(
      snapshot.registrySheet
    );

  const stock =
    ss.getSheetByName(
      snapshot.stockSheet
    );

  const movements =
    ss.getSheetByName(
      snapshot.movementSheet
    );

  const accruals =
    ss.getSheetByName(
      snapshot.accrualSheet
    );

  if (
    !registry ||
    !stock ||
    !movements ||
    !accruals
  ) {
    throw new Error(
      'Не знайдено лист для відкату LINKED-транзакції.'
    );
  }

  if (
    step5Clean_(
      registry
        .getRange(
          snapshot.registryRow,
          1
        )
        .getValue()
    ) !==
    step5Clean_(
      snapshot.vaccineId
    )
  ) {
    throw new Error(
      'Рядок реєстру не відповідає аварійному знімку.'
    );
  }

  if (
    step5Clean_(
      stock
        .getRange(
          snapshot.stockRow,
          1
        )
        .getValue()
    ) !==
    step5Clean_(
      snapshot.lotId
    )
  ) {
    throw new Error(
      'Рядок складу не відповідає аварійному знімку.'
    );
  }

  const movementRange =
    movements.getRange(
      snapshot.movementRow,
      1,
      1,
      12
    );

  const operationId =
    step5Clean_(
      movementRange
        .getCell(
          1,
          2
        )
        .getValue()
    );

  if (
    operationId &&
    operationId !==
      snapshot.syncOperationId
  ) {
    throw new Error(
      'У рядку руху вже міститься інша операція.'
    );
  }

  const accrualRange =
    accruals.getRange(
      snapshot.accrualRow,
      1,
      1,
      8
    );

  const accrualMarker =
    step5Clean_(
      accrualRange
        .getCell(
          1,
          8
        )
        .getValue()
    );

  if (
    accrualMarker &&
    accrualMarker !==
      snapshot.accrualMarker
  ) {
    throw new Error(
      'У рядку нарахування вже міститься інший запис.'
    );
  }

  /*
   * Відновлення L:N.
   */
  snapshot.stockCells.forEach(
    function(
      cellSnapshot,
      index
    ) {
      step5RestoreCell_(
        stock.getRange(
          snapshot.stockRow,
          12 + index
        ),
        cellSnapshot
      );
    }
  );

  /*
   * Відновлення F, H, I реєстру.
   */
  step5RestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      6
    ),
    snapshot.registryCells.status
  );

  step5RestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      8
    ),
    snapshot.registryCells.actualDate
  );

  step5RestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      9
    ),
    snapshot.registryCells.comment
  );

  /*
   * Очищення власного руху.
   */
  if (
    operationId ===
    snapshot.syncOperationId
  ) {
    movementRange.clearContent();

    movementRange.setNumberFormats([
      snapshot.movementFormats
    ]);
  }

  /*
   * Очищення власного нарахування.
   */
  if (
    accrualMarker ===
    snapshot.accrualMarker
  ) {
    accrualRange.clearContent();

    accrualRange.setNumberFormats([
      snapshot.accrualFormats
    ]);
  }

  SpreadsheetApp.flush();

  /*
   * Перевірка відновлення складу.
   */
  snapshot.stockCells.forEach(
    function(
      cellSnapshot,
      index
    ) {
      step5VerifyCell_(
        stock.getRange(
          snapshot.stockRow,
          12 + index
        ),
        cellSnapshot,
        'склад ' +
        (
          12 + index
        )
      );
    }
  );

  /*
   * Перевірка відновлення реєстру.
   */
  step5VerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      6
    ),
    snapshot.registryCells.status,
    'статус'
  );

  step5VerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      8
    ),
    snapshot.registryCells.actualDate,
    'фактична дата'
  );

  step5VerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      9
    ),
    snapshot.registryCells.comment,
    'коментар'
  );

  if (
    step5Clean_(
      movements
        .getRange(
          snapshot.movementRow,
          2
        )
        .getValue()
    ) ===
    snapshot.syncOperationId
  ) {
    throw new Error(
      'Результатний рух залишився після відкату.'
    );
  }

  if (
    step5Clean_(
      accruals
        .getRange(
          snapshot.accrualRow,
          8
        )
        .getValue()
    ) ===
    snapshot.accrualMarker
  ) {
    throw new Error(
      'Нарахування залишилось після відкату.'
    );
  }
}


function step5CellSnapshot_(
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


function step5RestoreCell_(
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


function step5VerifyCell_(
  range,
  snapshot,
  label
) {
  if (
    range.getFormula() !==
    (
      snapshot.formula ||
      ''
    )
  ) {
    throw new Error(
      'Не відновлено формулу: ' +
      label
    );
  }

  if (
    !snapshot.formula
  ) {
    const actual =
      range.getValue();

    const actualValue =
      actual instanceof Date
        ? 'DATE|' +
          actual.toISOString()
        : 'VALUE|' +
          String(
            actual == null
              ? ''
              : actual
          );

    const expectedValue =
      snapshot.value.type ===
      'DATE'
        ? 'DATE|' +
          snapshot.value.value
        : 'VALUE|' +
          String(
            snapshot.value.value == null
              ? ''
              : snapshot.value.value
          );

    if (
      actualValue !==
      expectedValue
    ) {
      throw new Error(
        'Не відновлено значення: ' +
        label
      );
    }
  }
}


function step5RequireBlank_(
  range,
  label
) {
  const values =
    range.getValues()[0];

  const formulas =
    range.getFormulas()[0];

  const occupied =
    values.some(
      function(
        value,
        index
      ) {
        return (
          step5Clean_(
            value
          ) !== '' ||
          step5Clean_(
            formulas[index]
          ) !== ''
        );
      }
    );

  if (
    occupied
  ) {
    throw new Error(
      'Не порожній ' +
      label +
      '.'
    );
  }
}


function step5ColumnContains_(
  sheet,
  column,
  expected
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return false;
  }

  return sheet
    .getRange(
      2,
      column,
      lastRow - 1,
      1
    )
    .getDisplayValues()
    .some(
      function(
        row
      ) {
        return (
          step5Clean_(
            row[0]
          ) ===
          step5Clean_(
            expected
          )
        );
      }
    );
}


function step5AssertNumber_(
  label,
  actual,
  expected,
  tolerance
) {
  if (
    Math.abs(
      step5Number_(
        actual
      ) -
      step5Number_(
        expected
      )
    ) >
    tolerance
  ) {
    throw new Error(
      label +
      ': очікується ' +
      expected +
      ', отримано ' +
      actual
    );
  }
}


function step5Clean_(
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


function step5Number_(
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

  const number =
    Number(
      step5Clean_(
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
    number
  )
    ? number
    : 0;
}


function step5RoundMoney_(
  value
) {
  return Math.round(
    (
      step5Number_(
        value
      ) +
      Number.EPSILON
    ) *
    100
  ) / 100;
}


function step5Error_(
  error
) {
  return (
    error &&
    error.message
      ? error.message
      : String(
          error
        )
  );
}