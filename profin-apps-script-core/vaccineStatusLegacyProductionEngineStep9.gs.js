/**
 * PROFIN OS — КРОК 9
 * Виробничий виконавець для LEGACY_UNLINKED
 * із собівартістю 0.
 *
 * Поки НЕ підключений до кнопки.
 * Змінює лише F/H/I у «Облік вакцин».
 * Не змінює склад, рухи та нарахування.
 */
function executeLegacyZeroCostStoredVaccineStatus_(
  actualDate,
  comment
) {
  const PROPERTY =
    'PROFIN_LEGACY_ZERO_COST_ACTIVE_TRANSACTION';

  if (
    !(actualDate instanceof Date) ||
    isNaN(actualDate.getTime())
  ) {
    throw new Error(
      'Потрібна коректна фактична дата.'
    );
  }

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  const props =
    PropertiesService.getDocumentProperties();

  let snapshot = null;

  try {
    if (props.getProperty(PROPERTY)) {
      throw new Error(
        'Є незавершена LEGACY-транзакція. ' +
        'Спочатку запустіть ' +
        'recoverInterruptedLegacyZeroCostStatusStep9().'
      );
    }

    const plan =
      step9BuildLegacyZeroCostPlan_();

    if (
      !plan.ok ||
      !plan.canWrite
    ) {
      throw new Error(
        plan.reason ||
        'LEGACY-запис не дозволено проводити.'
      );
    }

    const registry =
      SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName(
          'Облік вакцин'
        );

    if (!registry) {
      throw new Error(
        'Не знайдено лист «Облік вакцин».'
      );
    }

    /*
     * Повторна перевірка під блокуванням.
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

    if (
      step9Clean_(current[0]) !==
        plan.vaccineId ||

      step9Clean_(current[5]) !==
        'На зберіганні' ||

      step9Clean_(current[9]) !==
        '' ||

      step9Clean_(current[12]) !==
        '' ||

      Math.abs(
        step9Number_(current[4])
      ) >
        0.000001
    ) {
      throw new Error(
        'LEGACY-запис змінився після перевірки. ' +
        'Проведення зупинено.'
      );
    }

    /*
     * Постійний аварійний знімок.
     */
    snapshot = {
      version:
        '9.0-production-inactive',

      createdAt:
        new Date().toISOString(),

      registryRow:
        plan.registryRow,

      vaccineId:
        plan.vaccineId,

      status:
        step9CellSnapshot_(
          registry.getRange(
            plan.registryRow,
            6
          )
        ),

      actualDate:
        step9CellSnapshot_(
          registry.getRange(
            plan.registryRow,
            8
          )
        ),

      comment:
        step9CellSnapshot_(
          registry.getRange(
            plan.registryRow,
            9
          )
        )
    };

    /*
     * Знімок зберігається до першої зміни.
     */
    props.setProperty(
      PROPERTY,
      JSON.stringify(snapshot)
    );

    /*
     * 1. Новий статус.
     */
    registry
      .getRange(
        plan.registryRow,
        6
      )
      .setValue(
        plan.newStatus
      );

    /*
     * 2. Фактична дата.
     */
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

    /*
     * 3. Коментар.
     */
    registry
      .getRange(
        plan.registryRow,
        9
      )
      .setValue(
        step9Clean_(comment)
      );

    SpreadsheetApp.flush();

    /*
     * Післязаписна перевірка.
     */
    const statusAfter =
      step9Clean_(
        registry
          .getRange(
            plan.registryRow,
            6
          )
          .getValue()
      );

    const dateAfter =
      registry
        .getRange(
          plan.registryRow,
          8
        )
        .getValue();

    if (
      statusAfter !==
        plan.newStatus ||

      !(dateAfter instanceof Date)
    ) {
      throw new Error(
        'Післязаписна перевірка LEGACY-реєстру ' +
        'не пройдена.'
      );
    }

    /*
     * Транзакція підтверджена.
     */
    props.deleteProperty(
      PROPERTY
    );

    return {
      ok:
        true,

      version:
        '9.0-production-inactive',

      classification:
        'LEGACY_UNLINKED_ZERO_COST',

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
        0,

      registryWriteVerified:
        true,

      accrualSkippedBecauseCostIsZero:
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
        props.getProperty(PROPERTY);

      const saved =
        raw
          ? JSON.parse(raw)
          : snapshot;

      if (saved) {
        step9RestoreSnapshot_(saved);

        props.deleteProperty(
          PROPERTY
        );
      }

    } catch (recoveryError) {
      rollbackError =
        recoveryError;
    }

    if (rollbackError) {
      throw new Error(
        'LEGACY-транзакція завершилась помилкою, ' +
        'але відкат не підтверджено. ' +
        'Знімок збережено. Первинна помилка: ' +
        step9Error_(error) +
        '. Помилка відкату: ' +
        step9Error_(rollbackError)
      );
    }

    throw new Error(
      'LEGACY-транзакцію не проведено. ' +
      'Попередній стан відновлено. Причина: ' +
      step9Error_(error)
    );

  } finally {
    lock.releaseLock();
  }
}


/**
 * Dry-run кроку 9.
 * Нічого не записує.
 */
function previewLegacyZeroCostProductionStep9() {
  const plan =
    step9BuildLegacyZeroCostPlan_();

  const result = {
    ok:
      plan.ok,

    canWrite:
      plan.canWrite,

    test:
      'previewLegacyZeroCostProductionStep9',

    version:
      '9.0-production-dry-run',

    classification:
      plan.classification,

    reason:
      plan.reason,

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
      'Змінити лише F/H/I реєстру',

    accrualWillBeCreated:
      false,

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
 * Аварійне відновлення
 * перерваної транзакції.
 */
function recoverInterruptedLegacyZeroCostStatusStep9() {
  const PROPERTY =
    'PROFIN_LEGACY_ZERO_COST_ACTIVE_TRANSACTION';

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  try {
    const props =
      PropertiesService.getDocumentProperties();

    const raw =
      props.getProperty(PROPERTY);

    if (!raw) {
      const result = {
        ok:
          true,

        recovered:
          false,

        reason:
          'Незавершеної LEGACY-транзакції немає.'
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
      JSON.parse(raw);

    step9RestoreSnapshot_(snapshot);

    props.deleteProperty(
      PROPERTY
    );

    const result = {
      ok:
        true,

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


/**
 * Формує план для вибраної
 * історичної вакцини.
 */
function step9BuildLegacyZeroCostPlan_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const input =
    ss.getSheetByName(
      'Ввід операцій'
    );

  const registry =
    ss.getSheetByName(
      'Облік вакцин'
    );

  if (
    !input ||
    !registry
  ) {
    throw new Error(
      'Не знайдено форму або реєстр вакцин.'
    );
  }

  const selectedCell =
    input.getRange('D13');

  const vaccineId =
    step9ExtractId_(
      selectedCell.getDisplayValue(),
      selectedCell.getNote()
    );

  const newStatus =
    step9Clean_(
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
    ![
      'Використано',
      'Списано'
    ].includes(newStatus)
  ) {
    throw new Error(
      'У F13 оберіть «Використано» або «Списано».'
    );
  }

  const lastRow =
    registry.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'Реєстр вакцин порожній.'
    );
  }

  const rows =
    registry
      .getRange(
        2,
        1,
        lastRow - 1,
        13
      )
      .getValues();

  const index =
    rows.findIndex(
      function(row) {
        return (
          step9Clean_(row[0]) ===
          vaccineId
        );
      }
    );

  if (index === -1) {
    throw new Error(
      'Не знайдено вакцину ' +
      vaccineId
    );
  }

  const row =
    rows[index];

  const plan = {
    ok:
      false,

    canWrite:
      false,

    classification:
      'LEGACY_UNLINKED_ZERO_COST',

    reason:
      '',

    registryRow:
      index + 2,

    vaccineId:
      step9Clean_(row[0]),

    saleId:
      step9Clean_(row[1]),

    vaccineName:
      step9Clean_(row[3]),

    storedCost:
      step9Number_(row[4]),

    currentStatus:
      step9Clean_(row[5]),

    lotId:
      step9Clean_(row[9]),

    sourceMovementId:
      step9Clean_(row[12]),

    newStatus:
      newStatus
  };

  if (
    !plan.saleId ||
    !plan.vaccineName
  ) {
    plan.reason =
      'Відсутній ID продажу або назва вакцини.';

    return plan;
  }

  if (
    plan.currentStatus !==
    'На зберіганні'
  ) {
    plan.reason =
      'Поточний статус: ' +
      plan.currentStatus;

    return plan;
  }

  if (
    plan.lotId ||
    plan.sourceMovementId
  ) {
    plan.classification =
      'NOT_LEGACY_UNLINKED';

    plan.reason =
      'Запис має складський зв’язок J або M.';

    return plan;
  }

  if (
    Math.abs(
      plan.storedCost
    ) >
    0.000001
  ) {
    plan.classification =
      'LEGACY_COST_REQUIRES_SEPARATE_RULE';

    plan.reason =
      'Собівартість не дорівнює нулю: ' +
      plan.storedCost;

    return plan;
  }

  plan.ok =
    true;

  plan.canWrite =
    true;

  plan.reason =
    'Історичний запис із нульовою собівартістю дозволено.';

  return plan;
}


/**
 * Відновлення аварійного знімка.
 */
function step9RestoreSnapshot_(snapshot) {
  const registry =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        'Облік вакцин'
      );

  if (!registry) {
    throw new Error(
      'Не знайдено реєстр для відкату.'
    );
  }

  if (
    step9Clean_(
      registry
        .getRange(
          snapshot.registryRow,
          1
        )
        .getValue()
    ) !==
    snapshot.vaccineId
  ) {
    throw new Error(
      'Рядок реєстру не відповідає аварійному знімку.'
    );
  }

  step9RestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      6
    ),
    snapshot.status
  );

  step9RestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      8
    ),
    snapshot.actualDate
  );

  step9RestoreCell_(
    registry.getRange(
      snapshot.registryRow,
      9
    ),
    snapshot.comment
  );

  SpreadsheetApp.flush();

  step9VerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      6
    ),
    snapshot.status,
    'статус'
  );

  step9VerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      8
    ),
    snapshot.actualDate,
    'дата'
  );

  step9VerifyCell_(
    registry.getRange(
      snapshot.registryRow,
      9
    ),
    snapshot.comment,
    'коментар'
  );
}


function step9CellSnapshot_(range) {
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


function step9RestoreCell_(
  range,
  snapshot
) {
  if (snapshot.formula) {
    range.setFormula(
      snapshot.formula
    );

  } else if (
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
      snapshot.value.value
    );
  }

  range.setNumberFormat(
    snapshot.numberFormat
  );
}


function step9VerifyCell_(
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

  if (!snapshot.formula) {
    const actual =
      range.getValue();

    const actualValue =
      actual instanceof Date
        ? (
            'DATE|' +
            actual.toISOString()
          )
        : (
            'VALUE|' +
            String(
              actual == null
                ? ''
                : actual
            )
          );

    const expectedValue =
      snapshot.value.type ===
      'DATE'
        ? (
            'DATE|' +
            snapshot.value.value
          )
        : (
            'VALUE|' +
            String(
              snapshot.value.value == null
                ? ''
                : snapshot.value.value
            )
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


function step9ExtractId_(
  selectedValue,
  note
) {
  const rawNote =
    String(
      note ||
      ''
    ).trim();

  const match =
    rawNote.match(
      /ID вакцини:\s*([^\r\n]+)/i
    );

  if (
    match &&
    match[1]
  ) {
    return step9Clean_(
      match[1]
    );
  }

  const cleanNote =
    step9Clean_(rawNote);

  if (
    cleanNote &&
    cleanNote.indexOf('|') === -1
  ) {
    return cleanNote;
  }

  return step9Clean_(
    String(
      selectedValue ||
      ''
    ).split('|')[0]
  );
}


function step9Clean_(value) {
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


function step9Number_(value) {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const number =
    Number(
      step9Clean_(value)
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

  return Number.isFinite(number)
    ? number
    : 0;
}


function step9Error_(error) {
  return (
    error &&
    error.message
      ? error.message
      : String(error)
  );
}