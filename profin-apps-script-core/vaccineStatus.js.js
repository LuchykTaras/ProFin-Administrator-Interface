/****************************************************
 * ОБЛІК ВАКЦИН — ЗМІНА СТАТУСУ
 * --------------------------------------------------
 * Окремий модуль для роботи з листом "Облік вакцин".
 *
 * Джерела даних:
 * 1. Лист "Ввід операцій"
 *    - D13: Вакцина на зберіганні
 *    - E13: Строк / планова дата
 *    - F13: Новий статус
 *    - G13: Фактична дата
 *
 * 2. Лист "Облік вакцин"
 *    - A: ID вакцини
 *    - B: ID продажу
 *    - C: Пацієнт
 *    - D: Вакцина
 *    - E: Собівартість
 *    - F: Статус
 *    - G: Планова дата
 *    - H: Фактична дата
 *    - I: Коментар
 *
 * Основна логіка:
 * - D13 отримує dropdown тільки з вакцин зі статусом "На зберіганні".
 * - Користувач обирає вакцину.
 * - Скрипт підтягує планову дату в E13.
 * - Користувач обирає новий статус: "Використано" або "Списано".
 * - Після проведення статус оновлюється в листі "Облік вакцин".
 ****************************************************/


/****************************************************
 * Отримує список вакцин зі статусом "На зберіганні"
 * для dropdown у клітинці D13.
 ****************************************************/
function getStoredVaccinesForDropdown_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Облік вакцин');

  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 9).getDisplayValues();

  return data
    .filter(row => clean_(row[5]).toLowerCase().includes('зберіган'))
    .map(row => {
      const id = clean_(row[0]);
      const patient = clean_(row[2]);
      const vaccine = clean_(row[3]);
      const planDate = clean_(row[6]);

      return `${id} | ${vaccine} | ${patient} | ${planDate}`;
    })
    .filter(v => v !== '');
}

/****************************************************
 * Ставить dropdown у D13:
 * показує тільки вакцини зі статусом "На зберіганні".
 ****************************************************/
function applyStoredVaccineValidation_() {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INPUT_SHEET_NAME
      );

  if (!sheet) {
    return;
  }

  const options =
    getStoredVaccinesForDropdown_();

  const cell =
    sheet.getRange(
      INPUT.storedVaccine
    );

  cell.clearDataValidations();

  if (!options.length) {
    cell
      .clearContent()
      .clearNote();

    return;
  }

  const rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        options,
        true
      )

      /*
       * Не використовуємо системне
       * блокувальне вікно Google.
       *
       * Коректність ID перевіряємо
       * власною серверною логікою.
       */
      .setAllowInvalid(
        true
      )
      .setHelpText(
        'Оберіть конкретну вакцину зі списку'
      )
      .build();

  cell.setDataValidation(
    rule
  );
}
function testApplyStoredVaccineValidation() {
  applyStoredVaccineValidation_();
}
/****************************************************
 * ПЕРЕВІРКА ВИБОРУ ВАКЦИНИ D13
 *
 * Не довіряє тексту в клітинці.
 * Перевіряє ID проти фактичного списку
 * вакцин зі статусом «На зберіганні».
 ****************************************************/

function normalizeStoredVaccineSelection_(
  sheet
) {
  if (!sheet) {
    return false;
  }

  const cell =
    sheet.getRange(
      INPUT.storedVaccine
    );

  const selectedValue =
    clean_(
      cell.getDisplayValue()
    );

  if (!selectedValue) {
    cell.clearNote();

    return false;
  }

  const selectedId =
    clean_(
      selectedValue
        .split('|')[0]
    );

  const options =
    getStoredVaccinesForDropdown_();

  const canonicalValue =
    options.find(
      function(option) {
        const optionId =
          clean_(
            option
              .split('|')[0]
          );

        return (
          optionId ===
          selectedId
        );
      }
    );

  if (!canonicalValue) {
    cell
      .clearContent()
      .clearNote();

    const message =
      '🟡 Вакцину не знайдено серед вакцин на зберіганні. ' +
      'Відкрийте список і оберіть конкретну вакцину повторно.';

    showInputStatus_(
      message,
      'warning'
    );

    SpreadsheetApp
      .getActive()
      .toast(
        message,
        'Зміна статусу',
        7
      );

    return false;
  }

  /*
   * Приводимо значення до канонічного
   * формату зі списку.
   */
  if (
    clean_(canonicalValue) !==
    selectedValue
  ) {
    cell.setValue(
      canonicalValue
    );
  }

  return true;
}


/****************************************************
 * Ставить dropdown у F13:
 * дозволені статуси — "Використано" або "Списано".
 ****************************************************/
function applyVaccineNewStatusValidation_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Використано', 'Списано'], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(INPUT.newStatus)
    .clearDataValidations()
    .setDataValidation(rule);
}


/****************************************************
 * При виборі вакцини в D13:
 * - читає вибране значення;
 * - витягує планову дату;
 * - ставить її в E13;
 * - автоматично ставить сьогоднішню дату в G13.
 ****************************************************/
/****************************************************
 * ВИБІР ВАКЦИНИ НА ЗБЕРІГАННІ
 * --------------------------------------------------
 * Після вибору в D13:
 * - не видаляє dropdown;
 * - не перезаписує вибране значення;
 * - зберігає ID вакцини в примітці;
 * - знаходить фактичний рядок у "Облік вакцин";
 * - підтягує термін придатності або планову дату;
 * - встановлює фактичну дату.
 ****************************************************/
function syncSelectedStoredVaccine_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  const registrySheet =
    ss.getSheetByName(
      'Облік вакцин'
    );

  if (
    !inputSheet ||
    !registrySheet
  ) {
    return;
  }

  const selectedCell =
    inputSheet.getRange(
      INPUT.storedVaccine
    );

  const selectedValue =
    clean_(
      selectedCell.getDisplayValue()
    );

  if (!selectedValue) {
    selectedCell.clearNote();

    inputSheet
      .getRange(INPUT.expiryDate)
      .clearContent();

    inputSheet
      .getRange(INPUT.actualDate)
      .clearContent();

    return;
  }

  /*
   * У dropdown першим значенням стоїть
   * ID вакцини:
   *
   * ID | Вакцина | Пацієнт | Дата
   */
  const selectedId =
    clean_(
      selectedValue
        .split('|')[0]
    );

  if (!selectedId) {
    throw new Error(
      'Не вдалося визначити ID вибраної вакцини'
    );
  }

  const lastRow =
    registrySheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'У листі "Облік вакцин" немає записів'
    );
  }

  /*
   * Читаємо A:M, оскільки нові записи
   * вже можуть містити:
   *
   * J — ID партії
   * K — Серія
   * L — Термін придатності
   * M — ID руху
   */
  const registryValues =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        13
      )
      .getValues();

  const registryIndex =
    registryValues.findIndex(
      function(row) {
        return (
          clean_(row[0]) ===
          selectedId
        );
      }
    );

  if (registryIndex === -1) {
    throw new Error(
      'Вакцину не знайдено в "Облік вакцин": ' +
      selectedId
    );
  }

  const vaccineRow =
    registryValues[
      registryIndex
    ];

  const vaccineName =
    clean_(
      vaccineRow[3]
    );

  const currentStatus =
    clean_(
      vaccineRow[5]
    );

  const plannedDate =
    vaccineRow[6];

  const series =
    clean_(
      vaccineRow[10]
    );

  const inventoryExpiryDate =
    vaccineRow[11];

  if (
    currentStatus !==
    'На зберіганні'
  ) {
    throw new Error(
      'Обрана вакцина вже не має статусу "На зберіганні". ' +
      'Поточний статус: ' +
      currentStatus
    );
  }

  /*
   * Не змінюємо значення D13
   * і не видаляємо його dropdown.
   *
   * ID зберігаємо в примітці.
   */
  selectedCell.setNote(
    selectedId
  );

  /*
   * Для нових складських операцій
   * показуємо реальний термін придатності
   * з колонки L.
   *
   * Для історичних записів —
   * планову дату з колонки G.
   */
  const displayDate =
    inventoryExpiryDate instanceof Date &&
    !isNaN(
      inventoryExpiryDate.getTime()
    )
      ? inventoryExpiryDate
      : (
          plannedDate instanceof Date &&
          !isNaN(
            plannedDate.getTime()
          )
            ? plannedDate
            : ''
        );

  const expiryCell =
    inputSheet.getRange(
      INPUT.expiryDate
    );

  if (displayDate) {
    expiryCell
      .setValue(
        displayDate
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

  } else {
    expiryCell.clearContent();
  }

  /*
   * Новий статус дублюємо зі статті:
   * Використано або Списано.
   */
  const articleStatus =
    clean_(
      inputSheet
        .getRange(INPUT.article)
        .getDisplayValue()
    );

  if (
    articleStatus &&
    [
      'Використано',
      'Списано'
    ].includes(
      articleStatus
    )
  ) {
    inputSheet
      .getRange(INPUT.newStatus)
      .setValue(
        articleStatus
      );
  }

  /*
   * Фактична дата:
   * спочатку дата операції B4,
   * резервно — поточна дата.
   */
  const operationDate =
    inputSheet
      .getRange(INPUT.date)
      .getValue();

  const actualDate =
    operationDate instanceof Date &&
    !isNaN(
      operationDate.getTime()
    )
      ? operationDate
      : new Date();

  inputSheet
    .getRange(INPUT.actualDate)
    .setValue(
      actualDate
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );
  /*
 * У D13 зберігаємо тільки технічний ID.
 * Це значення використовується при проведенні.
 */
selectedCell.setNote(
  selectedId
);

/*
 * Інформацію для адміністратора
 * зберігаємо в примітці E13.
 */
inputSheet
  .getRange(
    INPUT.expiryDate
  )
  .setNote(
    [
      'ID вакцини: ' +
        selectedId,

      'Вакцина: ' +
        vaccineName,

      'Серія: ' +
        (
          series ||
          'не вказано'
        )
    ].join('\n')
  );

  SpreadsheetApp.flush();
}


/****************************************************
 * Оновлює статус вакцини в листі "Облік вакцин".
 *
 * Викликається при проведенні операції:
 * Тип = Вакцина
 * Категорія = Зміна статусу
 ****************************************************/
function updateVaccineStatusFromInput_(data) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  const registrySheet =
    ss.getSheetByName(
      'Облік вакцин'
    );

  if (!inputSheet) {
    throw new Error(
      'Не знайдено лист "Ввід операцій"'
    );
  }

  if (!registrySheet) {
    throw new Error(
      'Не знайдено лист "Облік вакцин"'
    );
  }

  const storedVaccineCell =
    inputSheet.getRange(
      INPUT.storedVaccine
    );

  const selectedValue =
    clean_(
      storedVaccineCell
        .getDisplayValue()
    );

  if (!selectedValue) {
    throw new Error(
      'Не обрано вакцину на зберіганні'
    );
  }

  /*
   * Отримуємо тільки чистий ID:
   * VAC-...-V1
   *
   * Функція підтримує:
   * - стару багаторядкову примітку;
   * - нову примітку лише з ID;
   * - значення з dropdown.
   */
  const vaccineId =
    extractStoredVaccineId_(
      selectedValue,
      storedVaccineCell.getNote()
    );

  if (!vaccineId) {
    throw new Error(
      'Не визначено ID вибраної вакцини'
    );
  }

  const newStatus =
    clean_(
      inputSheet
        .getRange(INPUT.newStatus)
        .getDisplayValue()
    ) ||
    clean_(
      inputSheet
        .getRange(INPUT.article)
        .getDisplayValue()
    );

  if (!newStatus) {
    throw new Error(
      'Не обрано новий статус'
    );
  }

  if (
    ![
      'Використано',
      'Списано'
    ].includes(
      newStatus
    )
  ) {
    throw new Error(
      'Недопустимий статус вакцини: ' +
      newStatus
    );
  }

  const actualDate =
    inputSheet
      .getRange(INPUT.actualDate)
      .getValue() ||
    data.date ||
    new Date();

  if (
    !(
      actualDate instanceof Date
    ) ||
    isNaN(
      actualDate.getTime()
    )
  ) {
    throw new Error(
      'Не визначено коректну фактичну дату'
    );
  }

  const lastRow =
    registrySheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'У листі "Облік вакцин" немає записів'
    );
  }

  /*
   * Читаємо A:M.
   */
  const registryValues =
    registrySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        13
      )
      .getValues();

  const normalizedVaccineId =
    clean_(
      vaccineId
    );

  const registryIndex =
    registryValues.findIndex(
      function(row) {
        return (
          clean_(row[0]) ===
          normalizedVaccineId
        );
      }
    );

  if (registryIndex === -1) {
    throw new Error(
      'Вакцину не знайдено в "Облік вакцин". ' +
      'ID вакцини: ' +
      normalizedVaccineId
    );
  }

  const vaccineRow =
    registryValues[
      registryIndex
    ];

  const targetRow =
    registryIndex + 2;

  const saleId =
    clean_(
      vaccineRow[1]
    );

  const patient =
    clean_(
      vaccineRow[2]
    );

  const vaccineName =
    clean_(
      vaccineRow[3]
    );

  const vaccineCost =
    Number(
      vaccineRow[4]
    ) || 0;

  const currentStatus =
    clean_(
      vaccineRow[5]
    );

  if (
    currentStatus !==
    'На зберіганні'
  ) {
    throw new Error(
      'Вакцина вже не перебуває на зберіганні. ' +
      'Поточний статус: ' +
      currentStatus
    );
  }

  /*
   * Знімок для локального відкату.
   * F — статус
   * H — фактична дата
   * I — коментар
   */
  const previousValues =
  registrySheet
    .getRange(
      targetRow,
      6,
      1,
      4
    )
    .getValues()[0];

let storageSyncResult = null;

try {
  /*
   * Спочатку синхронізуємо склад.
   *
   * Якщо склад не може виконати
   * перекласифікацію — статус у реєстрі
   * не змінюємо.
   */
  storageSyncResult =
    executeStoredVaccineInventorySync_(
      {
        vaccineId:
          normalizedVaccineId,

        saleId:
          saleId,

        vaccineName:
          vaccineName,

        currentStatus:
          currentStatus,

        newStatus:
          newStatus
      },
      actualDate
    );
    registrySheet
      .getRange(
        targetRow,
        6
      )
      .setValue(
        newStatus
      );

    registrySheet
      .getRange(
        targetRow,
        8
      )
      .setValue(
        actualDate
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

    registrySheet
      .getRange(
        targetRow,
        9
      )
      .setValue(
        data.comment || ''
      );

    /*
     * Поточний залишок складу тут
     * не зменшується повторно.
     *
     * Вакцина вже була вилучена
     * з доступного залишку під час
     * "Продажу на зберігання".
     */
    if (newStatus === 'Використано') {
  createStoredVaccineUsageAccrual_({
    saleId: saleId,
    vaccineId: normalizedVaccineId,
    date: actualDate,
    patient: patient,
    vaccineName: vaccineName,
    cost: vaccineCost,
    storageSyncResult: storageSyncResult
  });
}

    if (
      newStatus ===
      'Списано'
    ) {
      createStoredVaccineWriteOffAccrual_({
        saleId:
          saleId,

        vaccineId:
          normalizedVaccineId,

        date:
          actualDate,

        patient:
          patient,

        vaccineName:
          vaccineName,

        cost:
          vaccineCost
      });
    }

    SpreadsheetApp.flush();

    return {
      ok:
        true,

      vaccineId:
        normalizedVaccineId,

      row:
        targetRow,

      previousStatus:
        currentStatus,

      newStatus:
        newStatus,

      actualDate:
        actualDate
    };

  } catch (error) {
  /*
   * Спочатку відкочуємо склад.
   */
  try {
    rollbackStoredVaccineInventorySync_(
      storageSyncResult
    );
  } catch (storageRollbackError) {
    Logger.log(
      'Не вдалося відкотити складську зміну статусу: ' +
      storageRollbackError.message
    );
  }

  /*
   * Потім відновлюємо реєстр.
   */
  registrySheet
    .getRange(
      targetRow,
      6,
      1,
      4
    )
    .setValues([
      previousValues
    ]);

  SpreadsheetApp.flush();

    throw new Error(
    'Статус вакцини не змінено. ' +
    'Попередній стан відновлено. Причина: ' +
    (
      error &&
      error.message
        ? error.message
        : String(error)
    )
  );
  } 
} 
/****************************************************
 * Рахує показники для майбутнього дашборду:
 * - На зберіганні
 * - Використано
 * - Списано
 * - Прострочено на зберіганні
 ****************************************************/
function getVaccineDashboardStats_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Облік вакцин');

  if (!sheet) {
    return {
      stored: 0,
      used: 0,
      writtenOff: 0,
      overdueStored: 0
    };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      stored: 0,
      used: 0,
      writtenOff: 0,
      overdueStored: 0
    };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const today = new Date();

  let stored = 0;
  let used = 0;
  let writtenOff = 0;
  let overdueStored = 0;

  data.forEach(row => {
    const status = clean_(row[5]);
    const planDate = row[6];

    if (status === 'На зберіганні') stored++;
    if (status === 'Використано') used++;
    if (status === 'Списано') writtenOff++;

    if (
      status === 'На зберіганні' &&
      planDate instanceof Date &&
      planDate < today
    ) {
      overdueStored++;
    }
  });

  return {
    stored,
    used,
    writtenOff,
    overdueStored
  };
}
function createStoredVaccineUsageAccrual_(vaccine) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const accrualSheet =
    ss.getSheetByName(
      ACCRUAL_SHEET_NAME
    );

  if (!accrualSheet) {
    throw new Error(
      'Не знайдено лист "' +
      ACCRUAL_SHEET_NAME +
      '".'
    );
  }

  const branches =
    typeof INTERBRANCH_TRANSFER_CONFIG !==
    'undefined'
      ? INTERBRANCH_TRANSFER_CONFIG.branches
      : {};

  const settlementConfig =
    typeof INTERBRANCH_SETTLEMENTS_CONFIG !==
    'undefined'
      ? INTERBRANCH_SETTLEMENTS_CONFIG
      : null;

  const currentSpreadsheetId =
    ss.getId();

  const currentBranch =
    Object.keys(branches).find(
      function(branchName) {
        return (
          String(
            branches[branchName]
              .spreadsheetId || ''
          ).trim() === currentSpreadsheetId
        );
      }
    ) || '';

  /*
   * Звичайна логіка для інших філій.
   */
  if (
    !settlementConfig ||
    currentBranch !==
      settlementConfig.debtorBranch
  ) {
    const marker =
      'Списання собівартості вакцини зі зберігання: ' +
      vaccine.vaccineId;

    if (
      accrualExistsByComment_(
        accrualSheet,
        marker
      )
    ) {
      return {
        ok: true,
        writesNow: false,
        alreadyExists: true
      };
    }

    accrualSheet.appendRow([
      vaccine.saleId || vaccine.vaccineId,
      'Вакцина',
      vaccine.date,
      'Продаж і використання',
      vaccine.vaccineName,
      -Math.abs(
        Number(vaccine.cost || 0)
      ),
      vaccine.patient,
      marker
    ]);

    return {
      ok: true,
      writesNow: true,
      mode: 'STANDARD_VACCINE_COST'
    };
  }

  /*
   * Бабурка:
   * собівартість береться тільки з прийнятих
   * партій Альтернативи.
   */
  const plan =
    vaccine.storageSyncResult &&
    vaccine.storageSyncResult.plan;

  if (
    !plan ||
    !Array.isArray(plan.allocations) ||
    !plan.allocations.length
  ) {
    throw new Error(
      'Не знайдено розподіл партій для списання ' +
      'собівартості вакцини.'
    );
  }

  const transferSheet =
    ss.getSheetByName(
      'Переміщення між філіями'
    );

  if (!transferSheet) {
    throw new Error(
      'Не знайдено лист "Переміщення між філіями".'
    );
  }

  const transferRows =
    transferSheet.getLastRow() > 1
      ? transferSheet
          .getRange(
            2,
            1,
            transferSheet.getLastRow() - 1,
            20
          )
          .getValues()
      : [];

  function normalized_(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  const acceptedStatuses =
    new Set([
      'прийнято',
      'accepted'
    ]);

  /*
   * Ключ: ID партії, створеної на Бабурці.
   */
  const receivedLots =
    new Map();

  transferRows.forEach(function(row) {
    const sourceBranch =
      String(row[2] || '').trim();

    const destinationBranch =
      String(row[3] || '').trim();

    const receiverLotId =
      String(row[5] || '').trim();

    const status =
      normalized_(row[13]);

    if (
      sourceBranch !==
        settlementConfig.creditorBranch ||
      destinationBranch !==
        settlementConfig.debtorBranch ||
      !receiverLotId ||
      !acceptedStatuses.has(status)
    ) {
      return;
    }

    receivedLots.set(
      receiverLotId,
      {
        transferId:
          String(row[0] || '').trim(),

        sourceLotId:
          String(row[4] || '').trim(),

        unitCost:
          Number(row[11]) || 0
      }
    );
  });

  const rowsToWrite = [];
  const errors = [];
  let totalCost = 0;

  plan.allocations.forEach(function(allocation) {
    const receiverLotId =
      String(allocation.lotId || '').trim();

    const transfer =
      receivedLots.get(receiverLotId);

    if (!transfer) {
      errors.push(
        'Партія "' +
        receiverLotId +
        '" не знайдена серед прийнятих передач ' +
        'Альтернатива → Бабурка.'
      );
      return;
    }

    if (
      !transfer.transferId ||
      transfer.unitCost <= 0
    ) {
      errors.push(
        'Некоректна собівартість для партії "' +
        receiverLotId +
        '".'
      );
      return;
    }

    const quantity =
      Number(allocation.quantity || 0);

    if (quantity <= 0) {
      errors.push(
        'Некоректна кількість для партії "' +
        receiverLotId +
        '".'
      );
      return;
    }

    const amount =
      Math.round(
        quantity *
        transfer.unitCost *
        100
      ) / 100;

    const marker =
      'COGS_BABURKA_TRANSFER' +
      ' | vaccineId=' + vaccine.vaccineId +
      ' | transferId=' + transfer.transferId +
      ' | receiverLotId=' + receiverLotId +
      ' | sourceLotId=' + transfer.sourceLotId;

    /*
     * Повторний запуск не створює дубль.
     */
    if (
      accrualExistsByComment_(
        accrualSheet,
        marker
      )
    ) {
      return;
    }

    rowsToWrite.push([
      'COGS-' +
  vaccine.vaccineId +
  '-' +
  transfer.transferId +
  '-' +
  receiverLotId,

      'Витрати',

      vaccine.date,

      'Собівартість вакцин',

      vaccine.vaccineName,

      -Math.abs(amount),

      vaccine.patient,

      marker
    ]);

    totalCost += amount;
  });

  if (errors.length) {
    throw new Error(
      'Собівартість не створена: ' +
      errors.join(' ')
    );
  }

  if (!rowsToWrite.length) {
    return {
      ok: true,
      writesNow: false,
      alreadyExists: true,
      mode: 'BABURKA_TRANSFER_COST'
    };
  }

  accrualSheet
    .getRange(
      accrualSheet.getLastRow() + 1,
      1,
      rowsToWrite.length,
      rowsToWrite[0].length
    )
    .setValues(rowsToWrite);

  SpreadsheetApp.flush();

  return {
    ok: true,
    writesNow: true,
    mode: 'BABURKA_TRANSFER_COST',
    rowsCreated: rowsToWrite.length,
    totalCost: Math.round(totalCost * 100) / 100
  };
}
function createStoredVaccineWriteOffAccrual_(vaccine) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(ACCRUAL_SHEET_NAME);

  if (!sheet) {
    throw new Error('Не знайдено лист "Нарахування"');
  }

  const marker = 'Списання вакцини без використання: ' + vaccine.vaccineId;

  if (accrualExistsByComment_(sheet, marker)) return;

  sheet.appendRow([
    vaccine.saleId || vaccine.vaccineId,
    'Вакцина',
    vaccine.date,
    'Списання вакцин',
    vaccine.vaccineName,
    -Math.abs(vaccine.cost),
    vaccine.patient,
    marker
  ]);
}
function accrualExistsByComment_(sheet, marker) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return false;

  const comments = sheet
    .getRange(2, 8, lastRow - 1, 1)
    .getDisplayValues()
    .flat()
    .map(v => clean_(v));

  return comments.includes(clean_(marker));
}
/****************************************************
 * ОТРИМАННЯ ЧИСТОГО ID ВАКЦИНИ
 ****************************************************/
function extractStoredVaccineId_(
  selectedValue,
  cellNote
) {
  const rawNote =
    String(
      cellNote || ''
    ).trim();

  /*
   * Підтримка старої розширеної примітки:
   *
   * ID вакцини: VAC-...
   * Вакцина: ...
   * Серія: ...
   */
  const labeledMatch =
    rawNote.match(
      /ID вакцини:\s*([^\r\n]+)/i
    );

  if (
    labeledMatch &&
    labeledMatch[1]
  ) {
    return clean_(
      labeledMatch[1]
    );
  }

  /*
   * Новий формат:
   * у примітці зберігається тільки ID.
   */
  const normalizedNote =
    clean_(
      rawNote
    );

  if (
    normalizedNote &&
    !normalizedNote.includes(
      'Вакцина:'
    ) &&
    !normalizedNote.includes(
      'Серія:'
    )
  ) {
    return normalizedNote;
  }

  /*
   * Резервно беремо першу частину dropdown:
   * VAC-... | Бексеро | Пацієнт | Дата
   */
  return clean_(
    String(
      selectedValue || ''
    ).split('|')[0]
  );
}