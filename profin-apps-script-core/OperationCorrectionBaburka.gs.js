/**
 * ============================================================
 * КОНТРОЛЬОВАНЕ КОРИГУВАННЯ ОПЕРАЦІЙ — БАБУРКА
 * ============================================================
 */

const OP_CORRECTION_CONTEXT_KEY_BABURKA =
  'PROFIN_OPERATION_CORRECTION_CONTEXT_BABURKA';

const OP_CORRECTION_ALLOWED_TYPES_BABURKA = [
  'Доходи',
  'Витрати',
  'Інкасація'
];


/**
 * ЗАВАНТАЖУЄ ОПЕРАЦІЮ У «ВВІД ОПЕРАЦІЙ»
 */
function startOperationCorrectionBaburka() {
  const ui = SpreadsheetApp.getUi();

  try {
    if (isOperationCorrectionModeActiveBaburka_()) {
      const context =
        getOperationCorrectionContextBaburka_();

      const answer = ui.alert(
        'Коригування вже активне',
        'Зараз редагується операція:\n' +
          context.operationId +
          '\n\nСкасувати поточне редагування?',
        ui.ButtonSet.YES_NO
      );

      if (answer === ui.Button.YES) {
        return cancelOperationCorrectionBaburka();
      }

      return {
        ok: false,
        writesNow: false,
        correctionModeActive: true,
        operationId: context.operationId
      };
    }

    const prompt = ui.prompt(
      'Коригування операції',
      'Введіть точний ID операції, яку потрібно змінити.',
      ui.ButtonSet.OK_CANCEL
    );

    if (prompt.getSelectedButton() !== ui.Button.OK) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true
      };
    }

    const operationId =
      clean_(prompt.getResponseText());

    if (!operationId) {
      throw new Error(
        'ID операції не введено.'
      );
    }

    const lifecycle =
      analyzeOperationById_(
        operationId,
        { branch: 'Бабурка' }
      );

    if (lifecycle.baseRows.length !== 1) {
      throw new Error(
        lifecycle.baseRows.length
          ? 'Знайдено кілька рядків із таким ID.'
          : 'Операцію не знайдено в «Базі операцій».'
      );
    }

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const baseSheet =
      ss.getSheetByName('База операцій');

    const inputSheet =
      ss.getSheetByName('Ввід операцій');

    if (!baseSheet || !inputSheet) {
      throw new Error(
        'Не знайдено робочі листи.'
      );
    }

    const baseRow =
      lifecycle.baseRows[0];

    const row =
      baseSheet
        .getRange(baseRow, 1, 1, 33)
        .getValues()[0];

    const status =
      clean_(row[29]);

    const type =
      clean_(row[9]);

    if (status !== 'Проведено') {
      throw new Error(
        'Коригувати можна лише операції зі статусом «Проведено».\n' +
          'Поточний статус: ' +
          (status || 'порожній')
      );
    }

    /*
     * Для вакцини дозволена лише зміна собівартості.
     */
    if (type === 'Вакцина') {
      return startVaccineCostCorrectionBaburka_(
        operationId,
        row,
        inputSheet
      );
    }

    /*
     * Звичайна операція не повинна мати залежностей.
     */
    if (
      lifecycle.status !==
      'SAFE_SIMPLE_CANDIDATE'
    ) {
      throw new Error(
        'Операція має залежні записи й не може бути виправлена цим редактором.'
      );
    }

    if (
      OP_CORRECTION_ALLOWED_TYPES_BABURKA
        .indexOf(type) === -1
    ) {
      throw new Error(
        'Тип «' +
          type +
          '» поки не підтримується редактором.'
      );
    }

    loadSimpleOperationIntoInputBaburka_(
      inputSheet,
      row
    );

    setOperationCorrectionContextBaburka_({
      operationId: operationId,
      baseRow: baseRow,
      checksum: lifecycle.checksum,
      loadedAt: new Date().toISOString()
    });

    inputSheet.activate();

    inputSheet
      .getRange(INPUT.date)
      .activate();

    showInputStatus_(
      '🟡 РЕДАГУВАННЯ ID: ' +
        operationId +
        '. Внесіть зміни та натисніть «Провести операцію».',
      'warning'
    );

    return {
      ok: true,
      writesNow: false,
      operationId: operationId,
      baseRow: baseRow,
      checksum: lifecycle.checksum,
      correctionModeActive: true
    };

  } catch (error) {
    const message =
      String(
        error && error.message
          ? error.message
          : error
      );

    ui.alert(
      'Коригування не відкрито',
      message,
      ui.ButtonSet.OK
    );

    return {
      ok: false,
      writesNow: false,
      error: message
    };
  }
}


/**
 * ЗБЕРІГАЄ КОРИГУВАННЯ
 */
function saveOperationCorrectionBaburka() {
  const ui =
    SpreadsheetApp.getUi();

  const context =
    getOperationCorrectionContextBaburka_();

  if (!context) {
    ui.alert(
      'Режим коригування не активний',
      'Спочатку виберіть операцію за ID.',
      ui.ButtonSet.OK
    );

    return null;
  }

  try {
    if (
      context.mode ===
      'VACCINE_COST_ONLY'
    ) {
      return saveVaccineCostCorrectionBaburka_(
        context
      );
    }

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const baseSheet =
      ss.getSheetByName('База операцій');

    const auditSheet =
      ss.getSheetByName(
        'Журнал життєвого циклу'
      );

    if (!baseSheet || !auditSheet) {
      throw new Error(
        'Не знайдено «База операцій» або журнал.'
      );
    }

    const data =
      getInputOperationData_();

    normalizeSimpleCorrectionDataBaburka_(data);

    if (
      OP_CORRECTION_ALLOWED_TYPES_BABURKA
        .indexOf(data.type) === -1
    ) {
      throw new Error(
        'У режимі коригування дозволені лише: ' +
          OP_CORRECTION_ALLOWED_TYPES_BABURKA.join(', ') +
          '.'
      );
    }

    const validation =
      validateInputOperation_(data);

    if (!validation.ok) {
      ui.alert(
        'Дані не пройшли перевірку',
        validation.errors.join('\n'),
        ui.ButtonSet.OK
      );

      return validation;
    }

    const lifecycle =
      analyzeOperationById_(
        context.operationId,
        { branch: 'Бабурка' }
      );

    if (
      lifecycle.status !==
        'SAFE_SIMPLE_CANDIDATE' ||
      lifecycle.baseRows.length !== 1 ||
      lifecycle.checksum !==
        context.checksum
    ) {
      throw new Error(
        'Операція змінилася після завантаження ' +
          'або отримала залежності.\n' +
          'Коригування зупинено.'
      );
    }

    const baseRow =
      lifecycle.baseRows[0];

    const currentStatus =
      clean_(
        baseSheet
          .getRange(baseRow, 30)
          .getDisplayValue()
      );

    if (currentStatus !== 'Проведено') {
      throw new Error(
        'Поточний статус більше не дорівнює «Проведено».'
      );
    }

    const beforeValues =
      baseSheet
        .getRange(baseRow, 2, 1, 15)
        .getValues()[0];

    const afterValues =
      buildSimpleCorrectionRowBaburka_(
        data
      );

    const changes =
      buildSimpleCorrectionChangesBaburka_(
        beforeValues,
        afterValues
      );

    if (!changes.length) {
      ui.alert(
        'Змін немає',
        'Жодне з дозволених полів не було змінено.',
        ui.ButtonSet.OK
      );

      return {
        ok: false,
        writesNow: false,
        noChanges: true
      };
    }

    const reasonPrompt =
      ui.prompt(
        'Причина коригування',
        'Коротко вкажіть причину зміни. Це поле обов’язкове.',
        ui.ButtonSet.OK_CANCEL
      );

    if (
      reasonPrompt.getSelectedButton() !==
      ui.Button.OK
    ) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true
      };
    }

    const reason =
      clean_(
        reasonPrompt.getResponseText()
      );

    if (!reason) {
      throw new Error(
        'Причина коригування не вказана.'
      );
    }

    const warningText =
      validation.warnings.length
        ? '\n\nПопередження:\n• ' +
          validation.warnings.join('\n• ')
        : '';

    const confirmation =
      ui.alert(
        'Підтвердити коригування',
        'ID: ' +
          context.operationId +
          '\n\n' +
          changes.join('\n') +
          '\n\nПричина: ' +
          reason +
          warningText +
          '\n\nПочаткові значення будуть збережені в журналі.',
        ui.ButtonSet.YES_NO
      );

    if (confirmation !== ui.Button.YES) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true
      };
    }

    const result =
      executeSimpleOperationCorrectionBaburka_(
        context,
        beforeValues,
        afterValues,
        reason,
        changes
      );

    refreshDeletionGuardAfterSystemWriteBaburka_();
    clearOperationCorrectionContextBaburka_();

    try {
      clearInputForm_();

    } catch (clearError) {
      console.log(
        'Коригування збережено, але форму не очищено: ' +
          clearError.message
      );
    }

    showInputStatus_(
      '🟢 Операцію скориговано. ID: ' +
        context.operationId,
      'success'
    );

    ui.alert(
      'Коригування збережено',
      'ID: ' +
        context.operationId +
        '\nПодія журналу: ' +
        result.eventId +
        '\n\nДля відображення нових значень звіти потрібно оновити.',
      ui.ButtonSet.OK
    );

    return result;

  } catch (error) {
    const message =
      String(
        error && error.message
          ? error.message
          : error
      );

    ui.alert(
      'Коригування не виконано',
      message,
      ui.ButtonSet.OK
    );

    return {
      ok: false,
      writesNow: false,
      error: message
    };
  }
}


/**
 * СКАСОВУЄ РЕЖИМ КОРИГУВАННЯ
 */
function cancelOperationCorrectionBaburka() {
  const context =
    getOperationCorrectionContextBaburka_();

  clearOperationCorrectionContextBaburka_();

  try {
    clearInputForm_();

  } catch (error) {
    console.log(error.message);
  }

  showInputStatus_(
    '🟢 Режим коригування скасовано',
    'success'
  );

  return {
    ok: true,
    writesNow: false,
    correctionModeActive: false,
    operationId:
      context
        ? context.operationId
        : null
  };
}


/**
 * БЛОКУЄ ЗВИЧАЙНЕ ПРОВЕДЕННЯ,
 * ЯКЩО ФОРМА ПЕРЕБУВАЄ В РЕЖИМІ КОРИГУВАННЯ
 */
function blockPostingWhileCorrectionActiveBaburka_() {
  if (
    !isOperationCorrectionModeActiveBaburka_()
  ) {
    return false;
  }

  const context =
    getOperationCorrectionContextBaburka_();

  showInputStatus_(
    '🔴 Активний режим коригування ID: ' +
      context.operationId +
      '. Використайте меню коригування.',
    'error'
  );

  SpreadsheetApp.getUi().alert(
    'Проведення заблоковано',
    'Форма містить операцію для коригування.\n' +
      'Використайте «Провести операцію» для збереження ' +
      'або скасуйте режим коригування.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return true;
}
function executeSimpleOperationCorrectionBaburka_(
  context,
  beforeValues,
  afterValues,
  reason,
  changes
) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName('База операцій');

  const auditSheet =
    ss.getSheetByName('Журнал життєвого циклу');

  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Не вдалося отримати блокування документа.'
    );
  }

  let auditRow = null;
  let rowChanged = false;
  let actualBaseRow = null;

  try {
    const lifecycle = analyzeOperationById_(
      context.operationId,
      { branch: 'Бабурка' }
    );

    if (
      lifecycle.status !== 'SAFE_SIMPLE_CANDIDATE' ||
      lifecycle.baseRows.length !== 1 ||
      lifecycle.checksum !== context.checksum
    ) {
      throw new Error(
        'Стан операції змінився перед записом.'
      );
    }

    const baseRow = lifecycle.baseRows[0];
    actualBaseRow = baseRow;

    const currentValues = baseSheet
      .getRange(baseRow, 2, 1, 15)
      .getValues()[0];

    if (
      JSON.stringify(currentValues) !==
      JSON.stringify(beforeValues)
    ) {
      throw new Error(
        'Поля операції змінилися після підтвердження.'
      );
    }

    ensureOperationCorrectionAuditSchemaBaburka_(
      auditSheet
    );

    const eventId =
      'EVT-CORRECT-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ) +
      '-' +
      Utilities.getUuid()
        .replace(/-/g, '')
        .slice(0, 6)
        .toUpperCase();

    const userEmail =
      typeof getSafeUserEmail_ === 'function'
        ? getSafeUserEmail_()
        : Session.getActiveUser().getEmail();

    auditRow = auditSheet.getLastRow() + 1;

    auditSheet
      .getRange(auditRow, 1, 1, 15)
      .setValues([[
        eventId,
        new Date(),
        userEmail,
        'CORRECT',
        context.operationId,
        'База операцій',
        baseRow,
        'Проведено',
        'Проведено',
        lifecycle.checksum,
        'PREPARED',
        '',
        JSON.stringify(
          serializeCorrectionValuesBaburka_(
            beforeValues
          )
        ),
        JSON.stringify(
          serializeCorrectionValuesBaburka_(
            afterValues
          )
        ),
        reason
      ]]);

    SpreadsheetApp.flush();

    baseSheet
      .getRange(baseRow, 2, 1, 15)
      .setValues([afterValues]);

    rowChanged = true;

    baseSheet
      .getRange(baseRow, 4)
      .setNumberFormat('dd.MM.yyyy');

    SpreadsheetApp.flush();

    const writtenValues = baseSheet
      .getRange(baseRow, 2, 1, 15)
      .getValues()[0];

    if (
      JSON.stringify(writtenValues) !==
      JSON.stringify(afterValues)
    ) {
      throw new Error(
        'Записані значення не пройшли перевірку.'
      );
    }

    auditSheet
      .getRange(auditRow, 11)
      .setValue('COMPLETED');

    SpreadsheetApp.flush();

    const result = {
      ok: true,
      writesNow: true,
      operationId: context.operationId,
      eventId,
      baseRow,
      changedFields: changes.length,
      auditRow,
      reportsRegeneratedNow: false
    };

    console.log(
      'OP_CORRECTION_COMPLETED: ' +
      JSON.stringify(result)
    );

    return result;

  } catch (error) {
    let rollbackCompleted = false;

    if (rowChanged && actualBaseRow) {
      try {
        baseSheet
          .getRange(actualBaseRow, 2, 1, 15)
          .setValues([beforeValues]);

        SpreadsheetApp.flush();

        rollbackCompleted = true;

      } catch (rollbackError) {
        rollbackCompleted = false;
      }
    }

    if (auditRow) {
      try {
        auditSheet
          .getRange(auditRow, 11)
          .setValue(
            rollbackCompleted || !rowChanged
              ? 'FAILED_ROLLED_BACK'
              : 'FAILED_ROLLBACK_REQUIRED'
          );
      } catch (auditError) {
        // Основна помилка залишається пріоритетною.
      }
    }

    throw new Error(
      String(error.message || error) +
      ' | rollbackCompleted=' +
      rollbackCompleted
    );

  } finally {
    lock.releaseLock();
  }
}


/**
 * ЗАВАНТАЖЕННЯ ПОЛІВ У ФОРМУ
 */
function loadSimpleOperationIntoInputBaburka_(
  inputSheet,
  row
) {
  const cellsToClear = [
    INPUT.date,
    INPUT.account,
    INPUT.type,
    INPUT.category,
    INPUT.article,
    INPUT.doctor,
    INPUT.patient,
    INPUT.unitPrice,
    INPUT.quantity,
    INPUT.amount,
    INPUT.comment,
    INPUT.transferTo,

    INPUT.packageStart,
    INPUT.packageDuration,
    INPUT.packageMonthlyAmount,
    INPUT.packageAccrualStart,

    INPUT.vaccineName,
    INPUT.vaccinePatient,
    INPUT.vaccineCost,
    INPUT.vaccineSeries,

    INPUT.assetName,
    INPUT.assetCategory,
    INPUT.assetAmortization,
    INPUT.assetStartDate,

    INPUT.inventoryName,
    INPUT.inventorySeries,
    INPUT.inventoryExpiryDate,
    INPUT.inventorySupplier,

    INPUT.storedVaccine,
    INPUT.expiryDate,
    INPUT.newStatus,
    INPUT.actualDate
  ];

  cellsToClear.forEach(function(a1) {
    if (a1) {
      inputSheet
        .getRange(a1)
        .clearContent();
    }
  });

  inputSheet
    .getRange(INPUT.type)
    .setValue(row[9]);

  inputSheet
    .getRange(INPUT.category)
    .setValue(row[10]);

  if (
    typeof updateInputDependentDropdowns ===
    'function'
  ) {
    updateInputDependentDropdowns();
  }

  inputSheet.getRange(INPUT.date).setValue(row[3]);
  inputSheet.getRange(INPUT.account).setValue(row[1]);
  inputSheet.getRange(INPUT.transferTo).setValue(row[2]);
  inputSheet.getRange(INPUT.article).setValue(row[11]);
  inputSheet.getRange(INPUT.doctor).setValue(row[7]);
  inputSheet.getRange(INPUT.patient).setValue(row[8]);
  inputSheet.getRange(INPUT.unitPrice).setValue(row[4]);
  inputSheet.getRange(INPUT.quantity).setValue(row[5]);
  inputSheet.getRange(INPUT.amount).setValue(row[6]);
  inputSheet.getRange(INPUT.comment).setValue(row[12]);

  if (
    typeof updateInputBlocksView_ ===
    'function'
  ) {
    updateInputBlocksView_();
  }
}


/**
 * НОРМАЛІЗАЦІЯ ЗНАКІВ І ПОЛІВ
 */
function normalizeSimpleCorrectionDataBaburka_(data) {
  data.transferTo =
    data.type === 'Інкасація'
      ? clean_(data.transferTo)
      : '';

  if (data.type === 'Витрати') {
    data.amount =
      -Math.abs(Number(data.amount) || 0);

  } else {
    data.amount =
      Math.abs(Number(data.amount) || 0);
  }

  if (data.unitPrice !== '') {
    data.unitPrice =
      Math.abs(Number(data.unitPrice) || 0);
  }

  if (data.quantity !== '') {
    data.quantity =
      Math.abs(Number(data.quantity) || 0);
  }
}


/**
 * ФОРМУЄ B:P ДЛЯ ЗАПИСУ В БАЗУ
 */
function buildSimpleCorrectionRowBaburka_(data) {
  return [
    data.account,
    data.transferTo,
    data.date,
    data.unitPrice,
    data.quantity,
    data.amount,
    data.doctor,
    data.patient,
    data.type,
    data.category,
    data.article,
    data.comment,
    getMonthText_(data.date),
    getMonthText_(data.date),
    data.type
  ];
}


/**
 * ФОРМУЄ СПИСОК ЗМІН ДЛЯ ПІДТВЕРДЖЕННЯ
 */
function buildSimpleCorrectionChangesBaburka_(
  before,
  after
) {
  const labels = [
    'Рахунок',
    'На рахунок',
    'Дата',
    'Ціна за одиницю',
    'Кількість',
    'Сума',
    'Лікар',
    'Пацієнт',
    'Тип',
    'Категорія',
    'Стаття',
    'Коментар',
    'Місяць оплати',
    'Місяць нарахування',
    'Тип обліку'
  ];

  const changes = [];

  labels.forEach(function(label, index) {
    const oldValue =
      correctionComparableBaburka_(
        before[index]
      );

    const newValue =
      correctionComparableBaburka_(
        after[index]
      );

    if (oldValue !== newValue) {
      changes.push(
        '• ' +
        label +
        ': «' +
        oldValue +
        '» → «' +
        newValue +
        '»'
      );
    }
  });

  return changes;
}


/**
 * НОРМАЛІЗОВАНЕ ПОРІВНЯННЯ
 */
function correctionComparableBaburka_(value) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'dd.MM.yyyy'
    );
  }

  return clean_(value);
}


/**
 * СЕРІАЛІЗАЦІЯ ДЛЯ ЖУРНАЛУ
 */
function serializeCorrectionValuesBaburka_(values) {
  return values.map(function(value) {
    if (
      value instanceof Date &&
      !isNaN(value.getTime())
    ) {
      return {
        type: 'date',
        value: value.toISOString()
      };
    }

    return value;
  });
}


/**
 * ДОДАЄ КОЛОНКИ КОРИГУВАННЯ ДО ЖУРНАЛУ
 */
function ensureOperationCorrectionAuditSchemaBaburka_(
  sheet
) {
  const headers = [
    'Дані до',
    'Дані після',
    'Причина'
  ];

  const range =
    sheet.getRange(1, 13, 1, 3);

  const current =
    range.getDisplayValues()[0];

  if (
    current.every(function(value) {
      return !clean_(value);
    })
  ) {
    range.setValues([headers]);
    range.setFontWeight('bold');
    return;
  }

  const valid =
    headers.every(function(header, index) {
      return current[index] === header;
    });

  if (!valid) {
    throw new Error(
      'Колонки M:O журналу зайняті ' +
      'або мають іншу структуру.'
    );
  }
}


/**
 * КОНТЕКСТ КОРИГУВАННЯ ПОТОЧНОГО КОРИСТУВАЧА
 */
function getOperationCorrectionContextBaburka_() {
  const raw =
    PropertiesService
      .getUserProperties()
      .getProperty(
        OP_CORRECTION_CONTEXT_KEY_BABURKA
      );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);

  } catch (error) {
    clearOperationCorrectionContextBaburka_();
    return null;
  }
}


function setOperationCorrectionContextBaburka_(
  context
) {
  PropertiesService
    .getUserProperties()
    .setProperty(
      OP_CORRECTION_CONTEXT_KEY_BABURKA,
      JSON.stringify(context)
    );
}


function clearOperationCorrectionContextBaburka_() {
  PropertiesService
    .getUserProperties()
    .deleteProperty(
      OP_CORRECTION_CONTEXT_KEY_BABURKA
    );
}


function isOperationCorrectionModeActiveBaburka_() {
  return Boolean(
    getOperationCorrectionContextBaburka_()
  );
}